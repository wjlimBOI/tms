// app/api/tender-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import nodemailer from "nodemailer";
import { logInsert, logAuthEvent } from "@/lib/audit"; // ✅ audit imports
import { ROLE_IDS } from "@/lib/roles";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(req: NextRequest) { // ✅ Changed to NextRequest
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoleIds = (session.user as any).roleIds || [];
  const userId = (session.user as any).id;

  if (!userRoleIds.includes(ROLE_IDS.CONTRACTOR)) {
    await logAuthEvent("PERMISSION_DENIED", userId, req, {
      action: "create_tender_request",
      reason: "Only contractors can submit requests",
      source: "api"
    });
    return NextResponse.json({ error: "Only contractors can submit requests" }, { status: 403 });
  }

  const body = await req.json();
  const { tender_id, request_type, message } = body;

  if (!tender_id || !request_type || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const contractorName = session.user.name || "Contractor";
  const contractorEmail = (session.user as any).email || "";

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
    const emailSubject = `New ${request_type === "drawings" ? "Drawings Request" : "Information Request"} for Tender: ${tender.tender_name}`;
    const emailHtml = `
      <h2>New Request from Contractor</h2>
      <p><strong>Contractor:</strong> ${contractorName} (${contractorEmail})</p>
      <p><strong>Tender:</strong> ${tender.tender_name}</p>
      <p><strong>Request Type:</strong> ${request_type === "drawings" ? "Drawings" : "More Information"}</p>
      <p><strong>Message:</strong></p>
      <blockquote>${message.replace(/\n/g, "<br>")}</blockquote>
      <p>Please respond to the contractor directly.</p>
    `;

    await transporter.sendMail({
      from: `"Tender Portal" <${process.env.SMTP_USER}>`,
      to: pmEmail,
      subject: emailSubject,
      html: emailHtml,
    });
  } catch (emailError) {
    console.error("Failed to send email notification:", emailError);
  }

  return NextResponse.json({ success: true, message: "Request sent successfully" });
}