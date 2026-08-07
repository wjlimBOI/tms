// app/api/bq/submission-item/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { submissionId, itemId, quantity, rate } = await req.json();
  if (!submissionId || !itemId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Access control (same as export)
  const userId = session.user.id;
  const check = await query(
    `SELECT 1 FROM tender_submission WHERE submission_id = $1 AND contractor_id = $2 AND is_deleted = false`,
    [submissionId, userId]
  );
  if (check.rows.length === 0 && !((session.user as any).roleIds || []).includes(ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const amount = quantity !== undefined ? quantity * rate : undefined;
  const updateQuery = `
    INSERT INTO bq_submission_items (submission_id, template_item_id, quantity, rate, amount, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (submission_id, template_item_id) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      rate = EXCLUDED.rate,
      amount = EXCLUDED.amount,
      updated_at = NOW()
  `;
  await query(updateQuery, [
    submissionId,
    itemId,
    quantity !== undefined ? quantity : null,
    rate !== undefined ? rate : null,
    amount !== undefined ? amount : null,
  ]);
  return NextResponse.json({ success: true });
}