// app/api/tender-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";
import { sendTenderRequestEmail } from "@/lib/email";
import { logInsert, logAuthEvent } from "@/lib/audit"; // ✅ audit imports
import { ROLE_IDS } from "@/lib/roles";

const tenderRequestSchema = z.object({
  tender_id: z.coerce.number().int().positive(),
  request_type: z.enum(["drawings", "information"]),
  message: z.string().min(1, "Message is required").max(2000, "Message must be 2000 characters or fewer"),
});

export async function POST(req: NextRequest) { // ✅ Changed to NextRequest
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoleIds = session.user.roleIds || [];
    const userId = session.user.id;

    if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
      await logAuthEvent("PERMISSION_DENIED", userId, req, {
        action: "create_tender_request",
        reason: "Only contractors can submit requests",
        source: "api"
      });
      return NextResponse.json({ error: "Only contractors can submit requests" }, { status: 403 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const parsed = tenderRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const formattedErrors = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details: formattedErrors },
        { status: 400 }
      );
    }
    const { tender_id, request_type, message } = parsed.data;

    const contractorName = session.user.name || "Contractor";
    const contractorEmail = session.user.email || "";

    // Fetch tender details and project manager contacts
    const tenderResult = await query(
      `SELECT t.tender_name, t.project_manager_email, t.project_manager_name, t.project_manager_phone
       FROM tender t
       WHERE t.tender_id = $1 AND t.is_deleted = false`,
      [tender_id]
    );
    if (tenderResult.rows.length === 0) {
      return NextResponse.json({ error: "Tender not found" }, { status: 404 });
    }
    const tender = tenderResult.rows[0];
    const pmEmail = tender.project_manager_email || process.env.TEAM_EMAIL;
    const pmName = tender.project_manager_name || "Project Manager";

    // Insert request
    const insertResult = await query(
      `INSERT INTO tender_requests
         (tender_id, contractor_id, request_type, message, contractor_name, contractor_email, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
       RETURNING request_id, tender_id, contractor_id, request_type, message, contractor_name, contractor_email, status, created_at`,
      [tender_id, userId, request_type, message, contractorName, contractorEmail]
    );
    const newRequest = insertResult.rows[0];

    // ✅ Audit log
    await logInsert(
      "tender_requests",
      newRequest.request_id,
      newRequest,
      userId,
      req,
      {
        action: "create_tender_request",
        tender_id,
        request_type,
        source: "api"
      }
    );

    // Send email notification (non‑blocking; errors are logged)
    try {
      await sendTenderRequestEmail({
        tenderId: tender_id,
        tenderName: tender.tender_name,
        requestType: request_type,
        contractorName,
        contractorEmail,
        message,
        pmEmail,
        pmName,
      });
    } catch (emailError) {
      console.error("Failed to send email notification:", emailError);
    }

    return NextResponse.json({ success: true, message: "Request sent successfully" });
  } catch (error) {
    console.error("Tender request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
