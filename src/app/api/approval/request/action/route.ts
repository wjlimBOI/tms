import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { request_id, decision, comment } = await req.json();
  if (!request_id || !decision) {
    return NextResponse.json({ error: "Missing request_id or decision" }, { status: 400 });
  }

  const client = await (await import("@/lib/db")).default.connect();
  try {
    await client.query("BEGIN");

    // Fetch request details
    const reqRes = await client.query(
      `SELECT ar.*, ac.role_id, ac.step_order, ac.can_approve, ac.can_reject, ac.requires_comment
       FROM approval_requests ar
       JOIN approval_chains ac ON ar.resource_type = ac.resource_type AND ar.current_step = ac.step_order
       WHERE ar.request_id = $1`,
      [request_id]
    );
    if (reqRes.rows.length === 0) throw new Error("Request or chain not found");
    const reqData = reqRes.rows[0];
    if (reqData.role_id !== (session.user as any).role_id) {
      throw new Error("You are not authorized to approve this step");
    }
    if (decision === 'approve' && !reqData.can_approve) throw new Error("Approval not allowed at this step");
    if (decision === 'reject' && !reqData.can_reject) throw new Error("Rejection not allowed at this step");

    // Log history
    await client.query(
      `INSERT INTO approval_history (request_id, step_order, approver_id, decision, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [request_id, reqData.current_step, session.user.id, decision, comment || null]
    );

    if (decision === 'reject') {
      await client.query(`UPDATE approval_requests SET status = 'rejected' WHERE request_id = $1`, [request_id]);
    } else { // approve
      const nextStep = reqData.current_step + 1;
      const nextChain = await client.query(
        `SELECT step_order FROM approval_chains WHERE resource_type = $1 AND step_order = $2`,
        [reqData.resource_type, nextStep]
      );
      if (nextChain.rows.length === 0) {
        // Final approval
        await client.query(`UPDATE approval_requests SET status = 'approved' WHERE request_id = $1`, [request_id]);
        // Optionally, update the original resource status to "approved" here
      } else {
        await client.query(
          `UPDATE approval_requests SET current_step = $1 WHERE request_id = $2`,
          [nextStep, request_id]
        );
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error(error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  } finally {
    client.release();
  }
}