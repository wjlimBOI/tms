// app/api/bq/template/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenderId = searchParams.get("tenderId");
  // fetch from bq_template_items table where tender_id = tenderId
  // return list of items with item_id, description, unit, sort_order
}