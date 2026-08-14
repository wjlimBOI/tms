// app/api/bq/export/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import ExcelJS from "exceljs";
import { isSuperViewer } from "@/lib/roles";

async function buildXlsxBlob(rows: any[][], colWidths?: number[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BQ_Submission");
  for (const row of rows) ws.addRow(row);
  if (colWidths) {
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function getUnitDisplay(code: string, unitMap: Record<string, string>): string {
  return unitMap[code] || code;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
  }).format(value);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const submissionId = url.searchParams.get("submissionId");
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
  }

  const userRoleIds = (session.user as any)?.roleIds || [];
  const userId = session.user.id;

  // Access control
  let hasAccess = false;
  if (isSuperViewer(userRoleIds)) {
    hasAccess = true;
  } else {
    const check = await query(
      `SELECT 1 FROM tender_submission WHERE submission_id = $1 AND contractor_id = $2`,
      [submissionId, userId]
    );
    hasAccess = check.rows.length > 0;
  }
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch categories that are enabled for this submission
  const categoriesRes = await query(
    `SELECT c.category_id, c.category_name, c.sort_order
     FROM submission_category sc
     JOIN work_category c ON sc.category_id = c.category_id
     WHERE sc.submission_id = $1
     ORDER BY sc.sort_order`,
    [submissionId]
  );
  const categories = categoriesRes.rows;

  // Unit code -> display name, from the real unit_measure table (not a
  // hardcoded map) so a newly added unit shows up without a code change.
  const unitsRes = await query(`SELECT unit_code, unit_name FROM unit_measure`);
  const unitMap: Record<string, string> = {};
  for (const row of unitsRes.rows) unitMap[row.unit_code] = row.unit_name;

  if (categories.length === 0) {
    const buffer = await buildXlsxBlob([["No categories found for this submission"]]);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="bq_submission_${submissionId}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }

  // Prepare worksheet data
  const wsData: any[][] = [];

  // Global header (similar to viewing page)
  wsData.push(["BILL OF QUANTITIES"]);
  wsData.push([]);

  let grandTotal = 0;

  for (let catIdx = 0; catIdx < categories.length; catIdx++) {
    const category = categories[catIdx];
    const categoryId = category.category_id;
    const categoryName = category.category_name;

    // Fetch items for this category, ordered by sort_order
    const itemsRes = await query(
      `SELECT 
         line_item_id,
         description,
         quantity,
         unit,
         unit_price,
         discount,
         amount
       FROM bq_line_item
       WHERE submission_id = $1 AND category_id = $2
       ORDER BY sort_order`,
      [submissionId, categoryId]
    );
    const items = itemsRes.rows;

    if (items.length === 0) continue;

    // Category header
    wsData.push([`${catIdx + 1}. ${categoryName}`]);
    wsData.push([]);

    // Table header
    wsData.push([
      "Item No.",
      "Description",
      "Quantity",
      "Unit",
      "Unit Rate (SGD)",
      "Discount (SGD)",
      "Amount (SGD)",
    ]);

    // Items with item numbers
    let categoryTotal = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemNo = `${catIdx + 1}.${(i + 1).toString().padStart(2, "0")}`;
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const discount = Number(item.discount) || 0;
      const amount = Number(item.amount) || 0;

      wsData.push([
        itemNo,
        item.description,
        quantity,
        getUnitDisplay(item.unit, unitMap),
        unitPrice,
        discount,
        amount,
      ]);
      categoryTotal += amount;
    }

    // Category subtotal
    wsData.push([]);
    wsData.push(["", "", "", "", "", "Category Subtotal:", formatCurrency(categoryTotal)]);
    wsData.push([]);

    grandTotal += categoryTotal;
  }

  // Grand total
  wsData.push(["", "", "", "", "", "GRAND TOTAL:", formatCurrency(grandTotal)]);

  const buffer = await buildXlsxBlob(wsData, [12, 50, 12, 12, 15, 15, 18]);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename="bq_submission_${submissionId}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}