import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_IDS } from "@/lib/roles";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import { sanitize } from "@/lib/sanitize";
import { z } from "zod";

// Lightweight, one-time acknowledgement of the Form of Tender terms - the
// actual filled-and-signed document is still printed from
// tenders/[id]/edit and emailed in separately (see that route's own
// comment, and POST /api/tenders/[id]/submit). This endpoint exists so a
// contractor isn't forced through that full form every time just to reach
// the BQ; it writes the same tender_acknowledgment row that submit/route.ts
// does and that PUT /api/bq/submission requires before Draft -> Submitted.
const acknowledgeSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your full name to acknowledge.").max(200),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = session.user.roleIds || [];
  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    return NextResponse.json({ error: "Only contractors can acknowledge a tender" }, { status: 403 });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = acknowledgeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Validation failed" },
      { status: 400 }
    );
  }
  const fullName = sanitize(parsed.data.fullName);

  await applyScheduledTenderTransitions();
  const tenderCheck = await query(
    `SELECT ts.status_code FROM tender t
     JOIN tender_status ts ON t.status_id = ts.status_id
     WHERE t.tender_id = $1`,
    [tenderId]
  );
  if (tenderCheck.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }
  if (tenderCheck.rows[0].status_code !== "Open") {
    return NextResponse.json({ error: "This tender is no longer open." }, { status: 400 });
  }

  const contractorId = session.user.id;
  await query(
    `INSERT INTO tender_acknowledgment (tender_id, contractor_id, signature, acknowledged_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tender_id, contractor_id) DO UPDATE SET
       signature = EXCLUDED.signature,
       acknowledged_at = NOW()`,
    [tenderId, contractorId, fullName]
  );

  return NextResponse.json({ acknowledged: true });
}
