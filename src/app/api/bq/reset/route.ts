// app/api/bq/reset/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

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
  const userRoleId = (session.user as any)?.role_id;
  const isAdmin = userRoleId === 1;

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
    await client.query(`DELETE FROM bq_submission_categories WHERE submission_id = $1`, [submissionId]);

    // Get distinct category IDs from the tender's template items
    const templateCategories = await client.query(
      `SELECT DISTINCT category_id FROM bq_template_items WHERE tender_id = $1`,
      [tender_id]
    );

    if (templateCategories.rows.length === 0) {
      throw new Error("No categories found in template items");
    }

    for (const cat of templateCategories.rows) {
      await client.query(
        `INSERT INTO bq_submission_categories (submission_id, category_id) VALUES ($1, $2)`,
        [submissionId, cat.category_id]
      );
    }

    // ---- Reset items (only columns that exist in bq_submission_items) ----
    await client.query(`DELETE FROM bq_submission_items WHERE submission_id = $1`, [submissionId]);

    // Fetch template items: item_id (as template_item_id), quantity, rate
    const templateItems = await client.query(
      `SELECT item_id AS template_item_id, quantity, rate
       FROM bq_template_items
       WHERE tender_id = $1
       ORDER BY sort_order`,
      [tender_id]
    );

    if (templateItems.rows.length === 0) {
      throw new Error("No template items found");
    }

    for (const item of templateItems.rows) {
      const quantity = item.quantity || 0;
      const rate = item.rate || 0;
      const amount = quantity * rate;
      await client.query(
        `INSERT INTO bq_submission_items
         (submission_id, template_item_id, quantity, rate, amount, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          submissionId,
          item.template_item_id,
          quantity,
          rate,
          amount
        ]
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
    return NextResponse.json({ error: "Reset failed: " + (error as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}