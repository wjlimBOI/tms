// app/api/tenders/[id]/stage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import { sendStageNotificationEmail } from "@/lib/email";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { ROLE_IDS } from "@/lib/roles";
import { applyScheduledTenderTransitions } from "@/lib/tenderLifecycle";
import {
  getStatusCodeForStage,
  isFinalStage,
  isCancelledStage,
  isInitialStage,
  hasAdvancePermission,
  hasRevertPermission,
  awardBlocksRevert,
} from "@/lib/tenderStage";

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
    const userRoleIds: number[] = user.roleIds || [];

    // 2. Parse tender ID
    const { id } = await params;
    const tenderId = parseInt(id);
    if (isNaN(tenderId)) {
      return NextResponse.json(
        { error: "Invalid tender ID" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 4. Parse action
    const body = await request.json().catch(() => ({}));
    const { action } = body;
    if (!['advance', 'revert'].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'advance' or 'revert'" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Apply any pending tender_date/closing_date auto-transitions before
    // reading the current stage, so a manual advance/revert never races
    // against a stale snapshot (no cron exists — this app-wide check is the
    // only place these transitions happen; see src/lib/tenderLifecycle.ts).
    await applyScheduledTenderTransitions();

    // 3, 5-7. Fetch (with row lock), validate, and update the stage inside a
    // transaction so the award-revert check below can't race a concurrent
    // request (F14: revert must not silently disagree with tender_award).
    const client = await getClient();
    let tender: any;
    let currentStage: number;
    let newStage: number;
    let newStatusId: number;
    let newStatusCode: string;
    try {
      await client.query('BEGIN');

      const tenderRes = await client.query(
        `SELECT tender_id, tender_name, stage, status_id, closing_date
         FROM tender
         WHERE tender_id = $1 AND is_deleted = false
         FOR UPDATE`,
        [tenderId]
      );
      if (tenderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: "Tender not found" },
          { status: 404, headers: corsHeaders }
        );
      }
      tender = tenderRes.rows[0];
      currentStage = tender.stage;
      newStage = currentStage;

      if (action === 'advance') {
        if (isFinalStage(currentStage)) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: "Tender is already at the final stage" },
            { status: 400, headers: corsHeaders }
          );
        }
        if (isCancelledStage(currentStage)) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: "Cancelled tenders cannot be advanced" },
            { status: 400, headers: corsHeaders }
          );
        }

        if (!hasAdvancePermission(currentStage, userRoleIds)) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: "You are not authorized to advance this stage" },
            { status: 403, headers: corsHeaders }
          );
        }
        newStage = currentStage + 1;
      } else {
        // Revert: only admins
        if (!hasRevertPermission(userRoleIds)) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: "Only admins can revert a stage" },
            { status: 403, headers: corsHeaders }
          );
        }
        if (isInitialStage(currentStage)) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: "Tender is already at the initial stage" },
            { status: 400, headers: corsHeaders }
          );
        }

        // F14: refuse to revert out of Awarded(3) while an award record still
        // references this tender — stage and tender_award must not disagree
        // about whether the tender is awarded. Only Awarded can possibly
        // trigger this, so skip the extra query otherwise.
        if (isFinalStage(currentStage)) {
          const awardRes = await client.query(
            `SELECT award_id FROM tender_award WHERE tender_id = $1`,
            [tenderId]
          );
          if (awardBlocksRevert(currentStage, awardRes.rows.length > 0)) {
            await client.query('ROLLBACK');
            return NextResponse.json(
              { error: "Cannot revert: this tender has an award record. Void the award before reverting its stage." },
              { status: 409, headers: corsHeaders }
            );
          }
        }

        newStage = currentStage - 1;
      }

      // Get status_id for new status_code
      newStatusCode = getStatusCodeForStage(newStage);
      const statusRes = await client.query(
        `SELECT status_id FROM tender_status WHERE status_code = $1`,
        [newStatusCode]
      );
      if (statusRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: `Status '${newStatusCode}' not found in tender_status` },
          { status: 500, headers: corsHeaders }
        );
      }
      newStatusId = statusRes.rows[0].status_id;

      await client.query(
        `UPDATE tender
         SET stage = $1, status_id = $2, stage_updated_at = NOW(), updated_at = NOW()
         WHERE tender_id = $3`,
        [newStage, newStatusId, tenderId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

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
      // Only two real transitions remain: Open (1) and Closed (2). Notify the
      // FM RD and Finance GM stakeholders who still need to know the tender's
      // submission window opened/closed, even though they no longer gate the
      // transition itself.
      if (nextStage === 1) notifyRoleIds = [ROLE_IDS.FM_REGIONAL_DIRECTOR, ROLE_IDS.FINANCE_GENERAL_MANAGER];
      else if (nextStage === 2) notifyRoleIds = [ROLE_IDS.FM_REGIONAL_DIRECTOR, ROLE_IDS.FINANCE_GENERAL_MANAGER];

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
