import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any).role_id;
  if (userRole !== 13) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });

  // Get tender details
  const tenderInfo = await query(
    `SELECT t.tender_name, b.brand_name, br.branch_name
     FROM tender t
     JOIN branch br ON t.branch_id = br.branch_id
     JOIN brand b ON br.brand_id = b.brand_id
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );
  if (tenderInfo.rows.length === 0) return NextResponse.json({ error: "Tender not found" }, { status: 404 });

  // Get template categories and items
  const itemsResult = await query(
    `SELECT li.*, c.category_name, c.category_id
     FROM bq_template_item li
     JOIN bq_template_category c ON li.category_id = c.category_id
     WHERE li.tender_id = $1 AND li.is_deleted = false
     ORDER BY c.category_id, li.item_no`,
    [tenderId]
  );
  if (itemsResult.rows.length === 0) {
    return NextResponse.json({ error: "No template found for this tender" }, { status: 404 });
  }

  const categoriesMap = new Map();
  itemsResult.rows.forEach(item => {
    if (!categoriesMap.has(item.category_id)) {
      categoriesMap.set(item.category_id, { category_id: item.category_id, category_name: item.category_name });
    }
  });
  const categories = Array.from(categoriesMap.values());

  const items = itemsResult.rows.map(item => ({
    line_item_id: item.line_item_id,
    item_no: item.item_no,
    location: item.location,
    description: item.description,
    specifications: item.specifications,
    brand: item.brand,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    discount: item.discount,
    amount: item.amount,
    category_id: item.category_id,
    category_name: item.category_name,
  }));

  return NextResponse.json({
    tender_name: tenderInfo.rows[0].tender_name,
    brand_name: tenderInfo.rows[0].brand_name,
    branch_name: tenderInfo.rows[0].branch_name,
    categories,
    items,
  });
}