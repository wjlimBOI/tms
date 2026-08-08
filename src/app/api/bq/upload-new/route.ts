// app/api/bq/upload-new/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import ExcelJS from "exceljs";
import { ROLE_IDS } from "@/lib/roles";
import { isValidXlsxSignature } from "@/lib/fileValidation";

function mapUnit(unitRaw: string): string {
  const unit = unitRaw.trim().toUpperCase();
  const unitMap: Record<string, string> = {
    "L.S": "LS", "L.S.": "LS", "LS": "LS",
    "SET": "SET", "SETS": "SET",
    "NOS": "NOS",
    "SQFT": "SQFT", "SQF": "SQFT", "FT": "SQFT",
    "M": "M", "M2": "M2", "M3": "M3", "MR": "M",
    "MM": "MM", "KG": "KG", "LOT": "LOT"
  };
  return unitMap[unit] || "NOS";
}

function clean(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/\u00A0/g, ' ').trim();
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) : text;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function normalizeItemNumber(raw: any): string | null {
  const str = clean(raw);
  if (!str.includes('.')) return null;
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return num.toFixed(2);
}

function getCategoryNumber(normalized: string): number | null {
  const match = normalized.match(/^(\d+)\./);
  return match ? parseInt(match[1], 10) : null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    return NextResponse.json({ error: "Only contractors can create cost estimates" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const tenderIdRaw = formData.get("tenderId") as string;
  const bqName = formData.get("bqName") as string | null;

  if (!file || !tenderIdRaw) {
    return NextResponse.json({ error: "Missing file or tenderId" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const tenderId = parseInt(tenderIdRaw, 10);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tenderId" }, { status: 400 });
  }

  // Verify tender exists
  const tenderCheck = await query(`SELECT tender_id FROM tender WHERE tender_id = $1`, [tenderId]);
  if (tenderCheck.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!isValidXlsxSignature(buffer)) {
    return NextResponse.json({ error: "File content does not match .xlsx format" }, { status: 415 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (err) {
    console.error("Failed to parse Excel file:", err);
    return NextResponse.json({ error: "Invalid Excel file format. Please upload a valid .xlsx file." }, { status: 400 });
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return NextResponse.json({ error: "No worksheet found in the uploaded file." }, { status: 400 });
  }
  const rows: any[][] = [];
  for (let i = 1; i <= worksheet.rowCount; i++) {
    const values = worksheet.getRow(i).values as any[];
    values.shift(); // ExcelJS rows are 1-indexed; drop the leading undefined
    rows.push(values);
  }

  const categoriesRes = await query(
    `SELECT category_id, category_name, sort_order FROM work_category ORDER BY sort_order`
  );
  const categories = categoriesRes.rows;
  if (categories.length === 0) {
    return NextResponse.json({ error: "No work categories found" }, { status: 500 });
  }

  const parsedItems: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawItemNumber = clean(row[1]);   // B
    let description = clean(row[2]);       // C
    const qtyRaw = clean(row[3]);          // D
    const unitRaw = clean(row[4]);         // E
    const unitPriceRaw = clean(row[5]);    // F – Unit Rate

    if (!rawItemNumber || !rawItemNumber.includes('.')) continue;
    if (!description || description.toLowerCase().includes('subtotal')) continue;

    description = truncateText(description, 500);

    const normalized = normalizeItemNumber(rawItemNumber);
    if (!normalized) continue;

    const categoryNumber = getCategoryNumber(normalized);
    if (!categoryNumber || categoryNumber < 1 || categoryNumber > categories.length) continue;

    const categoryId = categories[categoryNumber - 1].category_id;

    let quantity: number = 0;
    const qtyClean = qtyRaw.replace(/,/g, '');
    if (qtyClean && !isNaN(parseFloat(qtyClean))) {
      quantity = parseFloat(qtyClean);
    }

    let unitPrice: number = 0;
    const priceClean = unitPriceRaw.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    if (priceClean && !isNaN(parseFloat(priceClean))) {
      unitPrice = parseFloat(priceClean);
    }

    let unitCode = mapUnit(unitRaw);
    if (!unitCode || unitCode === 'LS') {
      unitCode = 'NOS';
    }

    const parts = normalized.split('.');
    const sortOrder = parts.length > 1 ? parseInt(parts[1], 10) : 0;

    // amount is NOT inserted – let the database compute it if it's a generated column
    parsedItems.push({
      categoryId,
      description,
      quantity,
      unitCode,
      unitPrice,
      sortOrder,
    });
  }

  if (parsedItems.length === 0) {
    const sample = rows.slice(0, 15).map((r, idx) => ({
      row: idx+1,
      colB: clean(r[1]),
      colC: clean(r[2]),
      colD: clean(r[3]),
      colE: clean(r[4]),
      colF: clean(r[5]),
    }));
    return NextResponse.json({
      error: "No valid BQ items found. Check file format.",
      debug: { sample, totalRows: rows.length }
    }, { status: 400 });
  }

  const contractorId = (session.user as any)?.id;
  const finalBqName = bqName?.trim() || `BQ_${tenderId}_${Date.now()}`;

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const submissionRes = await client.query(
      `INSERT INTO tender_submission 
         (tender_id, contractor_id, round_no, status, bq_name, created_at, updated_at)
       VALUES ($1, $2, 1, 'Draft', $3, NOW(), NOW())
       RETURNING submission_id`,
      [tenderId, contractorId, finalBqName]
    );
    const submissionId = submissionRes.rows[0].submission_id;

    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO bq_line_item
           (submission_id, category_id, parent_item_id, description, quantity, unit, unit_price, amount, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [submissionId, item.categoryId, null, item.description, item.quantity, item.unitCode, item.unitPrice, item.quantity * item.unitPrice, item.sortOrder]
      );
    }

    // Optional: insert enabled categories (if table exists)
    const distinctCategories = [...new Set(parsedItems.map(i => i.categoryId))];
    for (const catId of distinctCategories) {
      await client.query(
        `INSERT INTO submission_category (submission_id, category_id) VALUES ($1, $2)
         ON CONFLICT (submission_id, category_id) DO NOTHING`,
        [submissionId, catId]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, submission_id: submissionId });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Upload-new error:", err);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  } finally {
    client.release();
  }
}