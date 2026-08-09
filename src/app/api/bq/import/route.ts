// app/api/bq/import/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import ExcelJS from "exceljs"; // ✅ replaced xlsx
import { ROLE_IDS } from "@/lib/roles";
import { canEditSubmission } from "@/lib/permissions";
import { isValidXlsxSignature } from "@/lib/fileValidation";
import { sanitize } from "@/lib/sanitize";

// ----- Constants for clamping (adjust as needed) -----
const MAX_QTY = 9999.99;
const MAX_RATE = 9999.99;
const MAX_AMOUNT = 99999999.99;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function parseNumeric(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    let cleaned = value.trim();
    if (cleaned.startsWith('=')) {
      const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
      if (matches && matches.length) {
        const lastNumber = parseFloat(matches[matches.length - 1]);
        if (!isNaN(lastNumber)) return lastNumber;
      }
      return 0;
    }
    cleaned = cleaned.replace(/[^\d.,\-]/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function sanitizeNumeric(val: number, max: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  let sanitized = Math.max(0, val);
  sanitized = Math.min(sanitized, max);
  sanitized = Math.round(sanitized * 100) / 100;
  return sanitized;
}

const normalize = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&/g, ' and ')
    .trim();
};

const similarity = (a: string, b: string): number => {
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === "" && normB === "") return 1;
  if (normA === "" || normB === "") return 0;
  const wordsA = new Set(normA.split(/\s+/));
  const wordsB = new Set(normB.split(/\s+/));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
};

const truncateText = (text: string, maxLength = 500): string => {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) : text;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const submissionIdRaw = formData.get("submissionId") as string;
  if (!file || !submissionIdRaw) {
    return NextResponse.json({ error: "Missing file or submissionId" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }
  const submissionId = parseInt(submissionIdRaw, 10);
  if (isNaN(submissionId)) {
    return NextResponse.json({ error: "Invalid submissionId" }, { status: 400 });
  }

  // Access control...
  const userRoleIds = (session.user as any)?.roleIds || [];
  const userId = session.user.id;
  let hasAccess = false;
  if (userRoleIds.includes(ROLE_IDS.ADMIN)) {
    hasAccess = true;
  } else {
    const check = await query(
      `SELECT 1 FROM tender_submission WHERE submission_id = $1 AND contractor_id = $2 AND is_deleted = false`,
      [submissionId, userId]
    );
    hasAccess = check.rows.length > 0;
  }
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canEdit = await canEditSubmission(submissionId, userId, userRoleIds);
  if (!canEdit) {
    return NextResponse.json({ error: "This submission can no longer be edited" }, { status: 403 });
  }

  // ----- 1. Get tender and categories -----
  const subInfo = await query(
    `SELECT ts.tender_id, wc.category_name, wc.category_id
     FROM tender_submission ts
     JOIN submission_category sc ON ts.submission_id = sc.submission_id
     JOIN work_category wc ON sc.category_id = wc.category_id
     WHERE ts.submission_id = $1
     ORDER BY wc.sort_order`,
    [submissionId]
  );
  if (subInfo.rows.length === 0) {
    return NextResponse.json({ error: "No categories found for this submission" }, { status: 400 });
  }
  const tenderId = subInfo.rows[0].tender_id;
  const categoryMap: Record<number, string> = {};
  subInfo.rows.forEach(row => { categoryMap[row.category_id] = row.category_name; });

  // ----- 2. Parse Excel using exceljs -----
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
    return NextResponse.json({ error: "Invalid Excel file format" }, { status: 400 });
  }

  // Find sheet: first try "BQ", else any non-empty sheet
  let worksheet = workbook.getWorksheet("BQ");
  if (!worksheet) {
    for (const sheet of workbook.worksheets) {
      // Check if sheet has any data
      const firstRow = sheet.getRow(1);
      const values = firstRow.values as any[];
      if (values && values.length > 0 && values.some(v => v !== undefined && v !== null && v !== '')) {
        worksheet = sheet;
        break;
      }
    }
  }
  if (!worksheet) {
    return NextResponse.json({ error: "No data sheet found (expected 'BQ')" }, { status: 400 });
  }

  // Extract all rows as array of arrays (0-indexed)
  const allRows: any[][] = [];
  const rowCount = worksheet.rowCount;
  for (let i = 1; i <= rowCount; i++) {
    const row = worksheet.getRow(i);
    const values = row.values as any[];
    // Remove the first element (undefined due to 1-indexing)
    values.shift();
    // Fill empty cells with empty string for consistency
    for (let j = 0; j < values.length; j++) {
      if (values[j] === undefined || values[j] === null) values[j] = '';
    }
    allRows.push(values);
  }

  if (!allRows.length) {
    return NextResponse.json({ error: "Excel file is empty" }, { status: 400 });
  }

  // Find header row
  let headerRowIndex = -1;
  let headerRow: any[] = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (row.some(cell => cell?.toString().trim().toLowerCase() === "description")) {
      headerRowIndex = i;
      headerRow = row;
      break;
    }
  }
  if (headerRowIndex === -1) {
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.some(cell => cell?.toString().trim().toLowerCase().includes("description"))) {
        headerRowIndex = i;
        headerRow = row;
        break;
      }
    }
  }
  if (headerRowIndex === -1) {
    return NextResponse.json({ error: "Could not find header row with 'Description'" }, { status: 400 });
  }

  console.log("[Import] Header row:", headerRow.map(cell => cell?.toString().trim() || ""));

  // Map columns
  const colMap: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const val = cell?.toString().trim() || "";
    const lower = val.toLowerCase();
    if (lower === "s/no." || lower === "s/no" || lower === "item") colMap.sno = idx;
    else if (lower === "description" || lower === "desc") colMap.desc = idx;
    else if (lower === "qty" || lower === "quantity") colMap.qty = idx;
    else if (lower === "u/rate" || lower === "unit rate" || lower === "rate") colMap.rate = idx;
    else if (lower === "amt" || lower === "amount") colMap.amt = idx;
    else if (lower === "unit" || lower === "uom") colMap.unit = idx;
  });

  const snoIdx = colMap.sno !== undefined ? colMap.sno : 1;
  const descIdx = colMap.desc !== undefined ? colMap.desc : 2;
  const qtyIdx = colMap.qty !== undefined ? colMap.qty : 3;
  const rateIdx = colMap.rate !== undefined ? colMap.rate : 5;
  const unitIdx = colMap.unit !== undefined ? colMap.unit : -1;

  console.log(`[Import] Using indices: sno=${snoIdx}, desc=${descIdx}, qty=${qtyIdx}, rate=${rateIdx}, unit=${unitIdx}`);

  const rows = allRows.slice(headerRowIndex + 1);

  // ----- 3. Parse categories & items -----
  const excelCategories: { name: string; items: { description: string; quantity: number; rate: number; unit: string }[] }[] = [];
  let currentExcelCat: any = null;
  let itemCount = 0;

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const sno = row[snoIdx]?.toString().trim() || "";
    // Sanitized here (not just at insert) since `desc` also becomes the
    // category name (currentExcelCat.name below) - both end up rendered via
    // dangerouslySetInnerHTML in bq/compare/page.tsx's highlightMatches.
    const desc = sanitize(row[descIdx]?.toString().trim() || "");
    const qtyVal = row[qtyIdx];
    const rateVal = row[rateIdx];
    const unit = unitIdx !== -1 ? (row[unitIdx]?.toString().trim() || "") : "";
    let qtyNum = parseNumeric(qtyVal);
    let rateNum = parseNumeric(rateVal);

    qtyNum = sanitizeNumeric(qtyNum, MAX_QTY);
    rateNum = sanitizeNumeric(rateNum, MAX_RATE);

    // Category row detection
    if (/^\d+$/.test(sno) && desc !== "" && qtyNum === 0 && rateNum === 0) {
      if (currentExcelCat) excelCategories.push(currentExcelCat);
      currentExcelCat = { name: desc, items: [] };
      continue;
    }

    if (currentExcelCat && (sno !== "" || desc !== "")) {
      if (qtyNum !== 0 || rateNum !== 0) {
        const lowerDesc = desc.toLowerCase();
        if (lowerDesc.startsWith("subtotal") || lowerDesc.startsWith("grand total") || lowerDesc.startsWith("note:")) continue;
        const item = {
          description: truncateText(desc, 500),
          quantity: qtyNum,
          rate: rateNum,
          unit: unit || 'NOS'
        };
        currentExcelCat.items.push(item);
        itemCount++;
        if (itemCount <= 5) {
          console.log(`[Import] Sample item ${itemCount}: qty=${qtyNum}, rate=${rateNum}, amount=${qtyNum * rateNum}, desc="${desc.substring(0, 30)}..."`);
        }
      }
    }
  }
  if (currentExcelCat) excelCategories.push(currentExcelCat);
  console.log(`[Import] Parsed ${excelCategories.length} categories and ${itemCount} total items`);

  // ----- 4. Match Excel categories to submission category IDs -----
  const matchedCategoryIds: { excelName: string; categoryId: number }[] = [];
  for (const excelCat of excelCategories) {
    let bestId = -1;
    let bestScore = 0;
    for (const [catId, catName] of Object.entries(categoryMap)) {
      const score = similarity(excelCat.name, catName);
      if (score > bestScore) { bestScore = score; bestId = parseInt(catId); }
    }
    if (bestScore > 0.6) {
      matchedCategoryIds.push({ excelName: excelCat.name, categoryId: bestId });
      console.log(`[Import] Matched "${excelCat.name}" -> cat ${bestId} (score: ${bestScore})`);
    } else {
      const index = excelCategories.indexOf(excelCat);
      if (index < subInfo.rows.length) {
        const fallbackId = subInfo.rows[index].category_id;
        matchedCategoryIds.push({ excelName: excelCat.name, categoryId: fallbackId });
        console.log(`[Import] Fallback order "${excelCat.name}" -> cat ${fallbackId}`);
      }
    }
  }

  // ----- 5. Deduplicate categories -----
  const uniqueCategoryIds = [...new Set(matchedCategoryIds.map(m => m.categoryId))];

  // ----- 6. Fetch existing template items -----
  const templateRes = await query(
    `SELECT item_id, category_id, description, unit FROM bq_template_items WHERE tender_id = $1`,
    [tenderId]
  );
  const existingTemplateItems = templateRes.rows;
  const templateItemMap: Record<string, { id: number; unit: string }> = {};
  for (const t of existingTemplateItems) {
    templateItemMap[t.description] = { id: t.item_id, unit: t.unit || '' };
  }

  const client = await (await import("@/lib/db")).default.connect();
  try {
    await client.query("BEGIN");

    // Clear existing data
    await client.query(`DELETE FROM bq_line_item WHERE submission_id = $1`, [submissionId]);
    await client.query(`DELETE FROM submission_category WHERE submission_id = $1`, [submissionId]);

    // Insert unique categories
    for (const catId of uniqueCategoryIds) {
      await client.query(
        `INSERT INTO submission_category (submission_id, category_id, sort_order)
         VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order),0)+1 FROM submission_category WHERE submission_id=$1))`,
        [submissionId, catId]
      );
    }

    let totalInserted = 0;
    let sortOrder = 0;

    for (const matched of matchedCategoryIds) {
      const catId = matched.categoryId;
      const excelCat = excelCategories.find(c => {
        const idx = excelCategories.indexOf(c);
        return similarity(c.name, categoryMap[catId]) > 0.6 || idx === matchedCategoryIds.indexOf(matched);
      });
      if (!excelCat) continue;

      for (const excelItem of excelCat.items) {
        const quantity = excelItem.quantity;
        const rate = excelItem.rate;
        let amount = quantity * rate;
        amount = sanitizeNumeric(amount, MAX_AMOUNT);

        let templateInfo = templateItemMap[excelItem.description];
        if (!templateInfo) {
          const insertRes = await client.query(
            `INSERT INTO bq_template_items 
               (tender_id, category_id, description, unit, quantity, rate, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, 
                     (SELECT COALESCE(MAX(sort_order),0)+1 FROM bq_template_items WHERE tender_id=$1 AND category_id=$2))
             RETURNING item_id, unit`,
            [tenderId, catId, excelItem.description, excelItem.unit, quantity, rate]
          );
          templateInfo = { id: insertRes.rows[0].item_id, unit: insertRes.rows[0].unit || '' };
          templateItemMap[excelItem.description] = templateInfo;
        }

        await client.query(
          `INSERT INTO bq_line_item
             (submission_id, category_id, description, unit, quantity, unit_price, total_price, amount, sort_order, discount, level)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, 0, 0)`,
          [submissionId, catId, excelItem.description, templateInfo.unit, quantity, rate, amount, sortOrder]
        );
        sortOrder++;
        totalInserted++;

        await client.query(
          `INSERT INTO bq_submission_items (submission_id, template_item_id, quantity, rate, amount, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (submission_id, template_item_id) DO UPDATE SET
             quantity = EXCLUDED.quantity,
             rate = EXCLUDED.rate,
             amount = EXCLUDED.amount,
             updated_at = NOW()`,
          [submissionId, templateInfo.id, quantity, rate, amount]
        );
      }
    }

    await client.query(
      `UPDATE tender_submission SET updated_at = NOW(), last_edit_at = NOW() WHERE submission_id = $1`,
      [submissionId]
    );

    await client.query("COMMIT");
    console.log(`[Import] Successfully inserted ${totalInserted} items.`);

    return NextResponse.json({
      success: true,
      updatedCount: totalInserted,
      message: `Updated ${totalInserted} items.`
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Import] Database error:", error);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  } finally {
    client.release();
  }
}