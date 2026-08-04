// app/api/tenders/[id]/stage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { sendStageNotificationEmail } from "@/lib/email";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";

// Map current stage -> allowed roles to advance (role_id)
const allowedAdvanceRoles: Record<number, number[]> = {
  0: [1],       // Admin: Submission → Finance GM Viewing
  1: [10],      // Finance GM: Finance GM Viewing → FM RD Viewing
  2: [6],       // FM RD: FM RD Viewing → Cost Comparison
  3: [1, 10],   // Admin or Finance GM: Cost Comparison → FM RD Final Viewing
  4: [6],       // FM RD: FM RD Final Viewing → Award
  5: [1],       // Admin: Award → Closed
};

// Map stage -> status_code
function getStatusCodeForStage(stage: number): string {
  if (stage === 0) return 'Upcoming';
  if (stage >= 1 && stage <= 5) return 'Open';
  if (stage >= 6) return 'Closed';
  return 'Open';
}

// ---------- OPTIONS (CORS preflight) ----------
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

// ---------- PUT ----------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // 1. Authenticate
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const user = session.user as any;
    const userId = user.id;
    const userRole = user.role_id;

    // 2. Parse tender ID
    const { id } = await params;
    const tenderId = parseInt(id);
    if (isNaN(tenderId)) {
      return NextResponse.json(
        { error: "Invalid tender ID" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Fetch tender details
    const tenderRes = await query(
      `SELECT tender_id, tender_name, stage, status_id, closing_date
       FROM tender
       WHERE tender_id = $1 AND is_deleted = false`,
      [tenderId]
    );
    if (tenderRes.rows.length === 0) {
      return NextResponse.json(
        { error: "Tender not found" },
        { status: 404, headers: corsHeaders }
      );
    }
    const tender = tenderRes.rows[0];
    const currentStage = tender.stage;

    // 4. Parse action
    const body = await request.json().catch(() => ({}));
    const { action } = body;
    if (!['advance', 'revert'].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'advance' or 'revert'" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 5. Determine new stage and validate
    let newStage = currentStage;

    if (action === 'advance') {
      if (currentStage >= 6) {
        return NextResponse.json(
          { error: "Tender is already at the final stage" },
          { status: 400, headers: corsHeaders }
        );
      }
      if (currentStage === -1) {
        return NextResponse.json(
          { error: "Cancelled tenders cannot be advanced" },
          { status: 400, headers: corsHeaders }
        );
      }

      const allowed = allowedAdvanceRoles[currentStage]?.includes(userRole);
      if (!allowed) {
        return NextResponse.json(
          { error: "You are not authorized to advance this stage" },
          { status: 403, headers: corsHeaders }
        );
      }
      newStage = currentStage + 1;
    } else {
      // Revert: only admins
      if (userRole !== 1) {
        return NextResponse.json(
          { error: "Only admins can revert a stage" },
          { status: 403, headers: corsHeaders }
        );
      }
      if (currentStage <= 0) {
        return NextResponse.json(
          { error: "Tender is already at the initial stage" },
          { status: 400, headers: corsHeaders }
        );
      }
      newStage = currentStage - 1;
    }

    // 6. Get status_id for new status_code
    const newStatusCode = getStatusCodeForStage(newStage);
    const statusRes = await query(
      `SELECT status_id FROM tender_status WHERE status_code = $1`,
      [newStatusCode]
    );
    if (statusRes.rows.length === 0) {
      return NextResponse.json(
        { error: `Status '${newStatusCode}' not found in tender_status` },
        { status: 500, headers: corsHeaders }
      );
    }
    const newStatusId = statusRes.rows[0].status_id;

    // 7. Update tender
    await query(
      `UPDATE tender
       SET stage = $1, status_id = $2, stage_updated_at = NOW(), updated_at = NOW()
       WHERE tender_id = $3`,
      [newStage, newStatusId, tenderId]
    );

    // 8. Audit log – fix column name
    // 👇 Replace 'performed_by' with the actual column name in your audit_log table.
    // Common names: user_id, performed_by, created_by, actor_id.
    // If you have a column 'user_id', you can use that; otherwise adjust.
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '0.0.0.0';

    // Change 'performed_by' to the correct column name from your table.
    // For this example, I'll use 'user_id' but you can change it.
    await query(
      `INSERT INTO audit_log (user_id, action, table_name, record_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        userId,
        `Stage ${action} from ${currentStage} to ${newStage}`,
        'tender',
        tenderId,
        JSON.stringify({ old_stage: currentStage, new_stage: newStage, old_status_id: tender.status_id, new_status_id: newStatusId }),
        clientIp,
      ]
    ).catch((err) => {
      // Log error but don't block the stage update – audit is optional.
      console.error('Audit log insert failed:', err);
    });

    // 9. Send email notifications if advancing
    if (action === 'advance') {
      const nextStage = newStage;
      let notifyRoleIds: number[] = [];
      if (nextStage === 1) notifyRoleIds = [10]; // Finance GM
      else if (nextStage === 2) notifyRoleIds = [6]; // FM RD
      else if (nextStage === 3) notifyRoleIds = [10]; // Finance GM (or cost comp role)
      else if (nextStage === 4) notifyRoleIds = [6]; // FM RD
      else if (nextStage === 5) notifyRoleIds = [1]; // Admin

      if (notifyRoleIds.length > 0) {
        const placeholders = notifyRoleIds.map((_, i) => `$${i + 1}`).join(',');
        const usersRes = await query(
          `SELECT user_id, email, name FROM users WHERE role_id IN (${placeholders}) AND is_active = true`,
          notifyRoleIds
        );

        const performedBy = user.name || user.email || 'System Administrator';

        for (const recipient of usersRes.rows) {
          await sendStageNotificationEmail({
            to: recipient.email,
            recipientName: recipient.name,
            tenderId: tenderId,
            tenderName: tender.tender_name,
            newStage: nextStage,
            performedBy,
          }).catch((err: any) => {
            console.error(`Failed to send stage email to ${recipient.email}:`, err);
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        stage: newStage,
        status_code: newStatusCode,
        message: `Stage ${action}ed successfully`,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('Stage update error:', error);
    // Return a user‑friendly message instead of exposing the raw error
    return NextResponse.json(
      { error: 'Unable to update stage. Please try again or contact support.' },
      { status: 500, headers: corsHeaders }
    );
  }
}