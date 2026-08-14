// app/api/bq/reset/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { isSuperUser } from "@/lib/roles";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { submissionId } = await req.json();
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
  }

  const userId = session.user.id;
  const userRoleIds = (session.user as any)?.roleIds || [];
  const isAdmin = isSuperUser(userRoleIds);

  // Fetch submission details
  const submissionResult = await query(
    `SELECT tender_id, contractor_id, status FROM tender_submission WHERE submission_id = $1`,
    [submissionId]
  );
  if (submissionResult.rows.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const { tender_id, contractor_id, status } = submissionResult.rows[0];

  const isOwner = String(contractor_id) === String(userId);
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (status !== "Draft") {
    return NextResponse.json({ error: "Cannot reset a non-draft submission" }, { status: 400 });
  }

  const client = await (await import("@/lib/db")).default.connect();
  try {
    await client.query("BEGIN");

    // ---- Reset categories ----
    await client.query(`DELETE FROM submission_category WHERE submission_id = $1`, [submissionId]);

    // Get distinct category IDs from the tender's template items, in the tender's configured order
    const templateCategories = await client.query(
      `SELECT DISTINCT ti.category_id, twc.sort_order
       FROM bq_template_items ti
       LEFT JOIN tender_work_category twc ON twc.tender_id = ti.tender_id AND twc.category_id = ti.category_id
       WHERE ti.tender_id = $1`,
      [tender_id]
    );

    if (templateCategories.rows.length === 0) {
      throw new Error("No categories found in template items");
    }

    for (const cat of templateCategories.rows) {
      await client.query(
        `INSERT INTO submission_category (submission_id, category_id, sort_order) VALUES ($1, $2, $3)`,
        [submissionId, cat.category_id, cat.sort_order ?? 0]
      );
    }

    // ---- Reset the actual displayed/edited line items ----
    await client.query(`DELETE FROM bq_line_item WHERE submission_id = $1`, [submissionId]);

    const templateItems = await client.query(
      `SELECT item_id, category_id, description, unit, sort_order, parent_item_id, quantity, rate
       FROM bq_template_items
       WHERE tender_id = $1
       ORDER BY sort_order`,
      [tender_id]
    );

    if (templateItems.rows.length === 0) {
      throw new Error("No template items found");
    }

    const oldToNewId = new Map<number, number>();
    const topLevel = templateItems.rows.filter((i: any) => !i.parent_item_id);
    const children = templateItems.rows.filter((i: any) => i.parent_item_id);

    const insertClonedItem = async (item: any, newParentId: number | null) => {
      const quantity = item.quantity ?? 0;
      const unit_price = item.rate ?? 0;
      const amount = quantity * unit_price;
      const res = await client.query(
        `INSERT INTO bq_line_item
           (submission_id, category_id, parent_item_id, location, description, specifications,
            brand, quantity, unit, unit_price, discount, amount, sort_order)
         VALUES ($1, $2, $3, '', $4, '', '', $5, $6, $7, 0, $8, $9)
         RETURNING line_item_id`,
        [submissionId, item.category_id, newParentId, item.description, quantity, item.unit, unit_price, amount, item.sort_order || 0]
      );
      oldToNewId.set(item.item_id, res.rows[0].line_item_id);
    };

    for (const item of topLevel) await insertClonedItem(item, null);
    for (const item of children) await insertClonedItem(item, oldToNewId.get(item.parent_item_id) ?? null);

    // ---- Also reset the legacy bq_submission_items table it was kept in sync with ----
    await client.query(`DELETE FROM bq_submission_items WHERE submission_id = $1`, [submissionId]);
    for (const item of templateItems.rows) {
      const quantity = item.quantity || 0;
      const rate = item.rate || 0;
      const amount = quantity * rate;
      await client.query(
        `INSERT INTO bq_submission_items
         (submission_id, template_item_id, quantity, rate, amount, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [submissionId, item.item_id, quantity, rate, amount]
      );
    }

    await client.query(
      `UPDATE tender_submission SET updated_at = NOW() WHERE submission_id = $1`,
      [submissionId]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, message: "BQ reset to template (categories and items)" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  } finally {
    client.release();
  }
}