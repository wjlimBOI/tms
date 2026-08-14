// app/api/tenders/[id]/comparison/route.ts
//
// A persisted, saved comparison snapshot for a tender (reno_comparison /
// reno_comparison_item — real tables, previously unused), distinct from
// bq/compare's live/ad-hoc view: this is a durable record staff can revisit
// and annotate per contractor (rank, computed total, notes), not
// recomputed fresh on every page load (2026-08-10).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { z } from "zod";
import { ROLE_IDS, isSuperUser } from "@/lib/roles";
import { sanitize } from "@/lib/sanitize";
import { logInsert, logUpdate } from "@/lib/audit";

function canManageComparison(roleIds: number[]): boolean {
  return (
    isSuperUser(roleIds) ||
    roleIds.includes(ROLE_IDS.PROJECT_MANAGER) ||
    roleIds.includes(ROLE_IDS.SENIOR_PROJECT_MANAGER) ||
    roleIds.includes(ROLE_IDS.FINANCE_MANAGER) ||
    roleIds.includes(ROLE_IDS.FINANCE_GENERAL_MANAGER) ||
    roleIds.includes(ROLE_IDS.FINANCE_TEAM)
  );
}

const saveSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

// ---------- GET — fetch the saved comparison, if any ----------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roleIds = (session.user as any)?.roleIds || [];
  if (!canManageComparison(roleIds)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });

  const compRes = await query(
    `SELECT rc.comparison_id, rc.title, rc.notes, rc.created_at, rc.updated_at, u.username AS created_by_name
     FROM reno_comparison rc
     JOIN users u ON u.user_id = rc.created_by
     WHERE rc.tender_id = $1`,
    [tenderId]
  );
  if (compRes.rows.length === 0) {
    return NextResponse.json(null);
  }
  const comparison = compRes.rows[0];

  const itemsRes = await query(
    `SELECT rci.item_id, rci.contractor_id, rci.submission_id, rci.compared_total, rci.rank, rci.reno_notes,
            u.username AS contractor_username
     FROM reno_comparison_item rci
     JOIN users u ON u.user_id = rci.contractor_id
     WHERE rci.comparison_id = $1
     ORDER BY rci.rank ASC NULLS LAST`,
    [comparison.comparison_id]
  );

  return NextResponse.json({ ...comparison, items: itemsRes.rows });
}

// ---------- POST — create or refresh the comparison snapshot ----------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const roleIds = (session.user as any)?.roleIds || [];
  if (!canManageComparison(roleIds)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — refresh with no title/notes change
  }
  const validation = saveSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: "Validation failed", details: validation.error.issues }, { status: 400 });
  }
  const title = validation.data.title ? sanitize(validation.data.title) : null;
  const notes = validation.data.notes ? sanitize(validation.data.notes) : null;

  // Latest Submitted/Approved total per contractor on this tender.
  const totalsRes = await query(
    `SELECT ts.contractor_id, ts.submission_id, SUM(bli.amount) AS total
     FROM tender_submission ts
     JOIN bq_line_item bli ON bli.submission_id = ts.submission_id
     WHERE ts.tender_id = $1 AND ts.is_deleted = false
       AND ts.status IN ('Submitted', 'Approved')
       AND ts.round_no = (
         SELECT MAX(round_no) FROM tender_submission
         WHERE tender_id = ts.tender_id AND contractor_id = ts.contractor_id AND is_deleted = false
       )
     GROUP BY ts.contractor_id, ts.submission_id`,
    [tenderId]
  );
  if (totalsRes.rows.length === 0) {
    return NextResponse.json(
      { error: "No submitted BQs on this tender yet — nothing to compare." },
      { status: 400 }
    );
  }
  const ranked = totalsRes.rows
    .map((r) => ({ contractor_id: r.contractor_id, submission_id: r.submission_id, total: Number(r.total) }))
    .sort((a, b) => a.total - b.total)
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const existingRes = await client.query(`SELECT comparison_id FROM reno_comparison WHERE tender_id = $1`, [tenderId]);
    let comparisonId: number;
    let isNew = false;

    if (existingRes.rows.length > 0) {
      comparisonId = existingRes.rows[0].comparison_id;
      await client.query(
        `UPDATE reno_comparison SET title = COALESCE($1, title), notes = COALESCE($2, notes), updated_at = NOW() WHERE comparison_id = $3`,
        [title, notes, comparisonId]
      );
    } else {
      isNew = true;
      const createRes = await client.query(
        `INSERT INTO reno_comparison (tender_id, created_by, title, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING comparison_id`,
        [tenderId, userId, title, notes]
      );
      comparisonId = createRes.rows[0].comparison_id;
    }

    // Preserve any staff-authored per-contractor notes across a refresh —
    // regenerating totals/ranks shouldn't wipe out annotations.
    const existingNotesRes = await client.query(
      `SELECT contractor_id, reno_notes FROM reno_comparison_item WHERE comparison_id = $1`,
      [comparisonId]
    );
    const notesByContractor = new Map<number, string | null>();
    existingNotesRes.rows.forEach((r: { contractor_id: number; reno_notes: string | null }) => {
      notesByContractor.set(r.contractor_id, r.reno_notes);
    });

    await client.query(`DELETE FROM reno_comparison_item WHERE comparison_id = $1`, [comparisonId]);
    for (const r of ranked) {
      await client.query(
        `INSERT INTO reno_comparison_item (comparison_id, contractor_id, submission_id, compared_total, rank, reno_notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [comparisonId, r.contractor_id, r.submission_id, r.total, r.rank, notesByContractor.get(r.contractor_id) ?? null]
      );
    }

    await client.query("COMMIT");

    if (isNew) {
      await logInsert("reno_comparison", comparisonId, { tender_id: tenderId, item_count: ranked.length }, userId, request, { action: "save_comparison", tender_id: tenderId, source: "api" });
    } else {
      await logUpdate("reno_comparison", comparisonId, {}, { item_count: ranked.length }, userId, request, { action: "refresh_comparison", tender_id: tenderId, source: "api" });
    }

    return NextResponse.json({ success: true, comparison_id: comparisonId, items: ranked }, { status: isNew ? 201 : 200 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error saving comparison:", err);
    return NextResponse.json({ error: "Unable to save the comparison. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
