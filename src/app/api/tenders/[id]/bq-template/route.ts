import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";
import { canViewTenderWithParticipation } from "@/lib/permissions";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRoleIds = (session.user as any).roleIds || [];
  const userId = (session.user as any).id;
  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });

  await applyScheduledTenderTransitions();

  // Get tender details
  const tenderInfo = await query(
    `SELECT t.tender_name, b.brand_name, br.branch_name, ts.status_code
     FROM tender t
     JOIN branch br ON t.branch_id = br.branch_id
     JOIN brand b ON br.brand_id = b.brand_id
     JOIN tender_status ts ON t.status_id = ts.status_id
     WHERE t.tender_id = $1 AND t.is_deleted = false`,
    [tenderId]
  );
  if (tenderInfo.rows.length === 0) return NextResponse.json({ error: "Tender not found" }, { status: 404 });

  // The BQ (pricing structure a contractor bids against) must not be visible
  // before the tender actually opens — Upcoming is announcement-only.
  if (tenderInfo.rows[0].status_code === 'Upcoming') {
    return NextResponse.json({ error: "This tender is not open yet" }, { status: 403 });
  }
  // Once Closed, only a contractor who actually participated (has a
  // submission) may still view it — same rule already applied to the tender
  // detail page (canViewTenderWithParticipation).
  const allowed = await canViewTenderWithParticipation(tenderId, userId, userRoleIds);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get template categories and items. tender_work_category is only
  // populated by the bulk Excel template upload, not by adding items one at
  // a time - so it's an optional ordering hint, not a requirement for a
  // category to show up here.
  const itemsResult = await query(
    `SELECT li.item_id, li.description, li.unit, li.quantity, li.rate, li.sort_order,
            c.category_id, c.category_name, COALESCE(twc.sort_order, c.sort_order) AS category_sort_order
     FROM bq_template_items li
     JOIN work_category c ON li.category_id = c.category_id
     LEFT JOIN tender_work_category twc ON twc.tender_id = li.tender_id AND twc.category_id = li.category_id
     WHERE li.tender_id = $1
     ORDER BY category_sort_order, li.sort_order`,
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
  const categoryIndex = new Map(categories.map((c, i) => [c.category_id, i + 1]));

  const itemCounters = new Map<number, number>();
  const items = itemsResult.rows.map(item => {
    const catNo = categoryIndex.get(item.category_id) || 0;
    const seq = (itemCounters.get(item.category_id) || 0) + 1;
    itemCounters.set(item.category_id, seq);
    const quantity = Number(item.quantity) || 0;
    const unit_price = Number(item.rate) || 0;
    return {
      line_item_id: item.item_id,
      item_no: `${catNo}.${seq.toString().padStart(2, "0")}`,
      location: null,
      description: item.description,
      specifications: null,
      brand: null,
      quantity,
      unit: item.unit,
      unit_price,
      discount: 0,
      amount: quantity * unit_price,
      category_id: item.category_id,
      category_name: item.category_name,
    };
  });

  return NextResponse.json({
    tender_name: tenderInfo.rows[0].tender_name,
    brand_name: tenderInfo.rows[0].brand_name,
    branch_name: tenderInfo.rows[0].branch_name,
    categories,
    items,
  });
}