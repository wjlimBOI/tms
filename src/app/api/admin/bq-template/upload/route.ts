// src/app/api/admin/bq-template/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";
import { getClient } from "@/lib/db";
import ExcelJS from "exceljs";
import { logUpdate, logAuthEvent } from "@/lib/audit"; // ✅ audit import
import { isValidXlsxSignature } from "@/lib/fileValidation";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Zod schema for form data validation
const formSchema = z.object({
  tenderId: z.string().regex(/^\d+$/, "tenderId must be a numeric string"),
  file: z.instanceof(File, { message: "File is required" }),
});

// Helper: check if user is admin
async function isAdmin(userId: number): Promise<boolean> {
  const userRole = await prisma.user_roles.findFirst({
    where: { user_id: userId, role_id: 1 },
  });
  return !!userRole;
}

// OPTIONS preflight handler
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---- Utility functions (unchanged) ----
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
  return unitMap[unit] || "LS";
}

function clean(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).replace(/\u00A0/g, ' ').trim();
  return sanitize(str);
}

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

// ---- POST handler ----
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAdmin(session.user.id))) {
    await logAuthEvent("PERMISSION_DENIED", session?.user?.id || 0, request, {
      action: "import_bq_template",
      reason: "Unauthorized",
      source: "admin_api"
    });
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders }
    );
  }

  // Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400, headers: corsHeaders }
    );
  }

  const file = formData.get("file") as File | null;
  const tenderIdRaw = formData.get("tenderId") as string | null;

  // Validate using Zod
  const validation = formSchema.safeParse({ file, tenderId: tenderIdRaw });
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }

  const { tenderId: tenderIdStr, file: uploadedFile } = validation.data;
  const tenderId = parseInt(tenderIdStr, 10);

  if (uploadedFile.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large" },
      { status: 413, headers: corsHeaders }
    );
  }

  // Check if tender exists
  const tenderExists = await prisma.tender.findUnique({
    where: { tender_id: tenderId },
    select: { tender_id: true },
  });
  if (!tenderExists) {
    return NextResponse.json(
      { error: "Tender not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // ✅ Read Excel file using exceljs
  const arrayBuffer = await uploadedFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!isValidXlsxSignature(buffer)) {
    return NextResponse.json(
      { error: "File content does not match .xlsx format" },
      { status: 415, headers: corsHeaders }
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (err) {
    console.error("Failed to parse Excel file:", err);
    return NextResponse.json(
      { error: "Invalid Excel file format. Please upload a valid .xlsx file." },
      { status: 400, headers: corsHeaders }
    );
  }

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    return NextResponse.json(
      { error: "No worksheet found in the uploaded file." },
      { status: 400, headers: corsHeaders }
    );
  }

  // Extract rows as array of arrays
  const rows: any[][] = [];
  const rowCount = worksheet.rowCount;
  for (let i = 1; i <= rowCount; i++) {
    const row = worksheet.getRow(i);
    const values = row.values as any[];
    values.shift();
    while (values.length < 5) values.push('');
    rows.push(values);
  }

  // Fetch categories ordered by sort_order
  const categories = await prisma.work_category.findMany({
    orderBy: { sort_order: 'asc' },
    select: { category_id: true, category_name: true, sort_order: true },
  });
  if (categories.length === 0) {
    return NextResponse.json(
      { error: "No work categories found in database" },
      { status: 500, headers: corsHeaders }
    );
  }

  const parsedItems: {
    categoryId: number;
    description: string;
    quantity: number | null;
    unitCode: string;
    sortOrder: number;
  }[] = [];
  const seenCategoryIds = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawItemNumber = clean(row[1]);
    const description = clean(row[2]);
    const qtyRaw = clean(row[3]);
    const unitRaw = clean(row[4]);

    if (!rawItemNumber || !rawItemNumber.includes('.')) continue;
    if (!description || description.toLowerCase().includes('subtotal')) continue;

    const normalized = normalizeItemNumber(rawItemNumber);
    if (!normalized) continue;

    const categoryNumber = getCategoryNumber(normalized);
    if (!categoryNumber || categoryNumber < 1 || categoryNumber > categories.length) {
      console.warn(`Row ${i+1}: Invalid category number from ${rawItemNumber} -> ${normalized}`);
      continue;
    }

    const categoryId = categories[categoryNumber - 1].category_id;
    seenCategoryIds.add(categoryId);

    let quantity: number | null = null;
    const qtyClean = qtyRaw.replace(/,/g, '');
    if (qtyClean && !isNaN(parseFloat(qtyClean))) {
      quantity = parseFloat(qtyClean);
    }

    const unitCode = mapUnit(unitRaw);
    const parts = normalized.split('.');
    const sortOrder = parts.length > 1 ? parseInt(parts[1], 10) : 0;

    parsedItems.push({
      categoryId,
      description,
      quantity,
      unitCode,
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
    }));
    return NextResponse.json({
      error: "No valid BQ items found. Make sure item numbers (e.g., '1.01') are in column B and descriptions in column C.",
      debug: { sample, totalRows: rows.length, categoriesCount: categories.length }
    }, { status: 400, headers: corsHeaders });
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    // 1️⃣ Fetch old data for audit (before deletion)
    const oldItems = await client.query(
      `SELECT * FROM bq_template_items WHERE tender_id = $1`,
      [tenderId]
    );
    const oldCategories = await client.query(
      `SELECT * FROM tender_work_category WHERE tender_id = $1`,
      [tenderId]
    );

    // 2️⃣ Delete existing items and category selections
    await client.query(`DELETE FROM bq_template_items WHERE tender_id = $1`, [tenderId]);
    await client.query(`DELETE FROM tender_work_category WHERE tender_id = $1`, [tenderId]);

    // 3️⃣ Insert enabled categories (ordered)
    const orderedCategoryIds = Array.from(seenCategoryIds).sort((a, b) => a - b);
    for (let i = 0; i < orderedCategoryIds.length; i++) {
      await client.query(
        `INSERT INTO tender_work_category (tender_id, category_id, sort_order) VALUES ($1, $2, $3)`,
        [tenderId, orderedCategoryIds[i], i]
      );
    }

    // 4️⃣ Insert all items
    let inserted = 0;
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO bq_template_items 
           (tender_id, category_id, parent_item_id, description, quantity, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenderId, item.categoryId, null, item.description, item.quantity, item.unitCode, item.sortOrder]
      );
      inserted++;
    }

    await client.query("COMMIT");

    // 5️⃣ Fetch new data for audit
    const newItems = await client.query(
      `SELECT * FROM bq_template_items WHERE tender_id = $1`,
      [tenderId]
    );
    const newCategories = await client.query(
      `SELECT * FROM tender_work_category WHERE tender_id = $1`,
      [tenderId]
    );

    // 6️⃣ Audit log – treat as an update on the tender's BQ template
    await logUpdate(
      "bq_template",
      tenderId,
      {
        items: oldItems.rows,
        categories: oldCategories.rows,
      },
      {
        items: newItems.rows,
        categories: newCategories.rows,
      },
      session.user.id,
      request,
      {
        action: "import_bq_template",
        tender_id: tenderId,
        imported_items: inserted,
        source: "admin_api"
      }
    );

    return NextResponse.json(
      { success: true, imported: inserted },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: corsHeaders }
    );
  } finally {
    client.release();
  }
}