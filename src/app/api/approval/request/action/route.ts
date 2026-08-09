import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";
import { enrichApprovalRows } from "@/lib/approvals";

class ApprovalActionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { request_id, decision, comment } = await req.json();
  if (!request_id || !decision) {
    return NextResponse.json({ error: "Missing request_id or decision" }, { status: 400 });
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  const client = await (await import("@/lib/db")).default.connect();
  let outcome: { finalStatus: "approved" | "rejected" | "advanced"; nextRoleId?: number } | null = null;
  try {
    await client.query("BEGIN");

    const reqRes = await client.query(
      `SELECT ar.*, ac.role_id, ac.step_order, ac.can_approve, ac.can_reject, ac.requires_comment
       FROM approval_requests ar
       JOIN approval_chains ac ON ar.resource_type = ac.resource_type AND ar.current_step = ac.step_order
       WHERE ar.request_id = $1`,
      [request_id]
    );
    if (reqRes.rows.length === 0) {
      throw new ApprovalActionError("Approval request not found, or is no longer at a configured step.", 404);
    }
    const reqData = reqRes.rows[0];
    if (reqData.status !== "pending") {
      throw new ApprovalActionError(`This request was already ${reqData.status}.`, 409);
    }
    const userRoleIds = (session.user as any).roleIds || [];
    if (!userRoleIds.includes(reqData.role_id)) {
      throw new ApprovalActionError("You are not authorized to act on this step.", 403);
    }
    if (decision === "approve" && !reqData.can_approve) {
      throw new ApprovalActionError("Approval is not allowed at this step.", 403);
    }
    if (decision === "reject" && !reqData.can_reject) {
      throw new ApprovalActionError("Rejection is not allowed at this step.", 403);
    }
    if (reqData.requires_comment && !comment?.trim()) {
      throw new ApprovalActionError("A comment is required to act on this step.", 400);
    }

    await client.query(
      `INSERT INTO approval_history (request_id, step_order, approver_id, decision, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [request_id, reqData.current_step, session.user.id, decision, comment || null]
    );

    if (decision === "reject") {
      await client.query(`UPDATE approval_requests SET status = 'rejected', updated_at = NOW() WHERE request_id = $1`, [request_id]);
      outcome = { finalStatus: "rejected" };
    } else {
      const nextStep = reqData.current_step + 1;
      const nextChain = await client.query(
        `SELECT step_order, role_id FROM approval_chains WHERE resource_type = $1 AND step_order = $2`,
        [reqData.resource_type, nextStep]
      );
      if (nextChain.rows.length === 0) {
        await client.query(`UPDATE approval_requests SET status = 'approved', updated_at = NOW() WHERE request_id = $1`, [request_id]);
        outcome = { finalStatus: "approved" };
      } else {
        await client.query(`UPDATE approval_requests SET current_step = $1, updated_at = NOW() WHERE request_id = $2`, [nextStep, request_id]);
        outcome = { finalStatus: "advanced", nextRoleId: nextChain.rows[0].role_id };
      }
    }
    await client.query("COMMIT");

    // Best-effort notifications, outside the transaction — must never affect
    // the already-committed decision.
    void (async () => {
      try {
        const [enriched] = await enrichApprovalRows([
          {
            request_id: reqData.request_id,
            resource_type: reqData.resource_type,
            resource_id: reqData.resource_id,
            current_step: reqData.current_step,
            created_at: reqData.created_at,
            status: reqData.status,
          },
        ]);
        const label = enriched?.resource_label || `${reqData.resource_type} #${reqData.resource_id}`;
        const link = enriched?.link || undefined;

        if (outcome?.finalStatus === "advanced" && outcome.nextRoleId) {
          const approverRes = await query(
            `SELECT DISTINCT u.user_id FROM user_roles ur JOIN users u ON u.user_id = ur.user_id
             WHERE ur.role_id = $1 AND u.is_active = true AND u.is_deleted = false`,
            [outcome.nextRoleId]
          );
          await notifyUsers(
            approverRes.rows.map((r: { user_id: number }) => r.user_id),
            "Approval required",
            `${label} is awaiting your sign-off.`,
            link
          );
        } else if (reqData.requester_id) {
          const verb = outcome?.finalStatus === "approved" ? "approved" : "rejected";
          await notifyUsers([reqData.requester_id], `Request ${verb}`, `${label} was ${verb}.`, link);
        }
      } catch (err) {
        console.error(`Failed to send approval-action notification for request ${request_id}:`, err);
      }
    })();

    return NextResponse.json({ success: true, status: outcome.finalStatus });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof ApprovalActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to process this approval action. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
