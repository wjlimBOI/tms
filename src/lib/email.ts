// lib/email.ts
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper: escape HTML special characters before interpolating untrusted
// (user-supplied) text into an email template, to prevent HTML injection /
// phishing content reaching the recipient's inbox renderer.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Helper: read logo as base64 data URI (for local development)
function getLogoDataUri(): string | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logos", "boi.png");
    if (fs.existsSync(logoPath)) {
      const imageBuffer = fs.readFileSync(logoPath);
      const base64 = imageBuffer.toString("base64");
      return `data:image/png;base64,${base64}`;
    }
  } catch (err) {
    console.warn("Logo not found, using URL fallback");
  }
  return null;
}

// ==================== WELCOME EMAIL ====================
export async function sendWelcomeEmail(
  email: string,
  username: string,
  tempPassword: string,
  token: string
) {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const setPasswordUrl = `${baseUrl}/set-password?token=${token}`;

  const isLocalhost = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  const logoSrc = isLocalhost
    ? getLogoDataUri() || `${baseUrl}/logos/boi.png`
    : `${baseUrl}/logos/boi.png`;

  const mailOptions = {
    from: `"Beauty One International" <${process.env.SMTP_FROM}>`,
    to: email,
    subject: "Welcome to Beauty One International – Set Your Password",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Beauty One International</title>
        <style>
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; }
            .button { width: 100% !important; text-align: center !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background-color:#f4f7fc;font-family:Arial,Helvetica,sans-serif;">
        <center style="width:100%;table-layout:fixed;">
          <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;margin:20px auto;border:1px solid #e0e7ef;">
            
            <!-- Header with logo -->
            <tr>
              <td bgcolor="#0f2b3d" style="background-color:#0f2b3d;padding:30px 24px;text-align:center;">
                <img src="${logoSrc}" alt="Beauty One International" width="180" style="display:block;max-width:180px;width:100%;height:auto;margin:0 auto 16px auto;border:0;" />
                <h1 style="color:#ffffff;font-size:26px;font-weight:600;margin:0;">Beauty One International</h1>
                <p style="color:#e2e8f0;font-size:15px;margin:8px 0 0;">Tender Management System</p>
              </td>
            </tr>

            <!-- Main content -->
            <tr>
              <td style="padding:30px 28px;">
                <p style="font-size:20px;font-weight:600;color:#1a2c3e;margin:0 0 16px;">Hello ${escapeHtml(username)},</p>
                <p style="font-size:16px;line-height:1.4;color:#334155;margin:0 0 24px;">
                  Welcome to the <strong>Beauty One International Tender Management System</strong>. Your account has been created successfully.
                </p>

                <!-- Credentials card -->
                <table width="100%" cellpadding="16" cellspacing="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:24px 0;">
                  <tr>
                    <td style="border-bottom:1px solid #e2e8f0;">
                      <span style="font-size:13px;font-weight:600;color:#0f3b5c;">🔐 USERNAME</span><br/>
                      <span style="font-size:18px;font-weight:500;color:#0f172a;">${escapeHtml(username)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span style="font-size:13px;font-weight:600;color:#0f3b5c;">🔑 TEMPORARY PASSWORD</span><br/>
                      <span style="display:inline-block;background-color:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:8px 12px;font-family:monospace;font-size:18px;font-weight:600;color:#0f3b5c;margin-top:6px;">${tempPassword}</span>
                    </td>
                  </tr>
                </table>

                <!-- CTA button -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 10px;">
                  <tr>
                    <td align="center">
                      <!--[if mso]>
                        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${setPasswordUrl}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="12%" stroke="f" fillcolor="#0d9488">
                          <w:anchorlock/>
                          <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:600;">Set your password →</center>
                        </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-- -->
                        <a href="${setPasswordUrl}" style="display:inline-block; background-color:#0d9488; color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:600; text-decoration:none; padding:12px 28px; border-radius:40px; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                          Set your password →
                        </a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                </table>

                <!-- Security notice -->
                <div style="background-color:#fffbeb; border-radius:12px; padding:14px 20px; margin:20px 0 20px 0;">
                  <span style="font-size:14px; color:#92400e;">
                    <strong>⚠️ Important security notice:</strong> Please set your password immediately. This link expires in 24 hours.
                  </span>
                </div>

                <p style="font-size:14px; color:#64748b; margin:0 0 0 0;">
                  If you did not request this account, please ignore this email or contact your system administrator.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td bgcolor="#f8fafc" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 24px 24px;padding:20px 28px;text-align:center;">
                <p style="margin:0 0 6px;font-size:12px;color:#64748b;">
                  © ${new Date().getFullYear()} Beauty One International Pte Ltd. All rights reserved.
                </p>
                <p style="margin:0;font-size:12px;color:#64748b;">
                  This is an automated message — please do not reply.
                </p>
                <p style="margin:10px 0 0;">
                  <a href="${baseUrl}" style="color:#0d9488;text-decoration:none;font-size:12px;">Visit our portal</a>
                </p>
              </td>
            </tr>
          </table>
        </center>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// ==================== EXTENSION REQUEST EMAIL ====================
export async function sendExtensionRequestEmail(data: {
  tenderName: string;
  tenderId: number;
  requestedBy: string;
  requestedDays: number;
  reason: string;
  originalClosing: string;
  proposedClosing: string;
  approverEmails: string[];
  ccEmails: string[];
  requestId: number;
}) {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const reviewUrl = `${baseUrl}/admin/tenders/${data.tenderId}/extensions/${data.requestId}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tender Extension Request</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px 28px; border: 1px solid #e0e7ef; }
        h2 { color: #1a2c3e; margin-top: 0; }
        .label { font-weight: 600; color: #334155; }
        .blockquote { background-color: #f8fafc; padding: 12px 16px; border-left: 4px solid #0d9488; margin: 12px 0; }
        .button { display: inline-block; background-color: #0d9488; color: #ffffff; padding: 12px 24px; border-radius: 40px; text-decoration: none; font-weight: 600; }
        .footer { margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>⏱️ Tender Extension Request</h2>
        <p><strong>Tender:</strong> ${escapeHtml(data.tenderName)} (ID: ${data.tenderId})</p>
        <p><strong>Requested by:</strong> ${escapeHtml(data.requestedBy)}</p>
        <p><strong>Additional Days:</strong> ${data.requestedDays}</p>
        <p><strong>Reason:</strong></p>
        <div class="blockquote">${escapeHtml(data.reason).replace(/\n/g, "<br>")}</div>
        <p><span class="label">Original Closing:</span> ${new Date(data.originalClosing).toLocaleString()}</p>
        <p><span class="label">Proposed Closing:</span> ${new Date(data.proposedClosing).toLocaleString()}</p>
        <p style="margin-top: 24px;">
          <a href="${reviewUrl}" class="button">Review &amp; Approve</a>
        </p>
        <p style="font-size: 14px; color: #64748b;">
          You are receiving this email because you are an approver or have been CC'd on this request.
        </p>
        <div class="footer">
          © ${new Date().getFullYear()} Beauty One International Pte Ltd<br>
          This is an automated message — please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: data.approverEmails.join(", "),
    cc: data.ccEmails.join(", "),
    subject: `Tender Extension Request: ${data.tenderName}`,
    html,
  });
}

// ==================== EXTENSION DECISION EMAIL ====================
export async function sendExtensionDecisionEmail(data: {
  tenderName: string;
  requesterEmail: string;
  requesterName: string;
  status: "Approved" | "Rejected";
  reason?: string;
  originalClosing: string;
  proposedClosing: string;
  tenderId: number;
}) {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const tenderUrl = `${baseUrl}/tenders/${data.tenderId}`;

  const subject =
    data.status === "Approved"
      ? `✅ Extension Approved: ${data.tenderName}`
      : `❌ Extension Rejected: ${data.tenderName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Extension Decision</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px 28px; border: 1px solid #e0e7ef; }
        h2 { color: #1a2c3e; margin-top: 0; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; }
        .approved { background-color: #d1fae5; color: #065f46; }
        .rejected { background-color: #fee2e2; color: #991b1b; }
        .label { font-weight: 600; color: #334155; }
        .blockquote { background-color: #f8fafc; padding: 12px 16px; border-left: 4px solid #0d9488; margin: 12px 0; }
        .button { display: inline-block; background-color: #0d9488; color: #ffffff; padding: 10px 20px; border-radius: 40px; text-decoration: none; font-weight: 600; }
        .footer { margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Extension Request ${data.status}</h2>
        <p><strong>Tender:</strong> ${escapeHtml(data.tenderName)}</p>
        <p>
          <span class="status-badge ${data.status === "Approved" ? "approved" : "rejected"}">
            ${data.status}
          </span>
        </p>
        <p><span class="label">Requested by:</span> ${escapeHtml(data.requesterName)}</p>
        <p><span class="label">Original Closing:</span> ${new Date(data.originalClosing).toLocaleString()}</p>
        <p><span class="label">Proposed Closing:</span> ${new Date(data.proposedClosing).toLocaleString()}</p>
        ${data.reason ? `<p><span class="label">Reason for ${data.status.toLowerCase()}:</span> ${escapeHtml(data.reason)}</p>` : ""}
        <p style="margin-top: 24px;">
          <a href="${tenderUrl}" class="button">View Tender</a>
        </p>
        <div class="footer">
          © ${new Date().getFullYear()} Beauty One International Pte Ltd<br>
          This is an automated message — please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: data.requesterEmail,
    subject,
    html,
  });
}

// ==================== STAGE NOTIFICATION EMAIL (ENHANCED) ====================
const STAGE_NAMES = ['Upcoming', 'Open', 'Closed', 'Awarded'];

export async function sendStageNotificationEmail({
  to,
  recipientName,
  tenderId,
  tenderName,
  newStage,
  performedBy,
}: {
  to: string;
  recipientName: string;
  tenderId: number;
  tenderName: string;
  newStage: number;
  performedBy: string;
}) {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const tenderUrl = `${baseUrl}/tenders/${tenderId}`;
  const stageName = STAGE_NAMES[newStage] || `Stage ${newStage}`;

  const subject = `Tender Stage Update: ${tenderName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tender Stage Update</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px 28px; border: 1px solid #e0e7ef; }
        h2 { color: #1a2c3e; margin-top: 0; }
        .stage-badge { display: inline-block; background-color: #0d9488; color: white; padding: 4px 14px; border-radius: 20px; font-weight: 600; }
        .button { display: inline-block; background-color: #0d9488; color: #ffffff; padding: 10px 20px; border-radius: 40px; text-decoration: none; font-weight: 600; }
        .footer { margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>📋 Tender Stage Updated</h2>
        <p>Dear ${escapeHtml(recipientName)},</p>
        <p>
          The tender <strong>${escapeHtml(tenderName)}</strong> (ID: ${tenderId})
          has been moved to <strong>${stageName}</strong> by <strong>${escapeHtml(performedBy)}</strong>.
        </p>
        <p>Please review the tender and take the necessary action.</p>
        <p style="margin-top: 24px;">
          <a href="${tenderUrl}" class="button">View Tender</a>
        </p>
        <p style="font-size: 12px; color: #64748b;">
          This is an automated notification from the Tender Management System.
        </p>
        <div class="footer">
          © ${new Date().getFullYear()} Beauty One International Pte Ltd<br>
          This is an automated message — please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"TMS System" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      html,
    });
    console.log(`Stage notification email sent to ${to} for tender ${tenderId}`);
  } catch (error) {
    console.error(`Failed to send stage email to ${to}:`, error);
    // Do not throw – we don't want to block the stage update
  }
}

// ==================== TENDER REQUEST EMAIL (drawings / information) ====================
export async function sendTenderRequestEmail(data: {
  tenderId: number;
  tenderName: string;
  requestType: "drawings" | "information";
  contractorName: string;
  contractorEmail: string;
  message: string;
  pmEmail: string;
  pmName: string;
}): Promise<void> {
  const requestTypeLabel = data.requestType === "drawings" ? "Drawings" : "More Information";
  const subject = `New ${data.requestType === "drawings" ? "Drawings Request" : "Information Request"} for Tender: ${data.tenderName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Tender Request</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 24px 28px; border: 1px solid #e0e7ef; }
        h2 { color: #1a2c3e; margin-top: 0; }
        .label { font-weight: 600; color: #334155; }
        .blockquote { background-color: #f8fafc; padding: 12px 16px; border-left: 4px solid #0d9488; margin: 12px 0; }
        .footer { margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>New Request from Contractor</h2>
        <p>Dear ${escapeHtml(data.pmName)},</p>
        <p><span class="label">Contractor:</span> ${escapeHtml(data.contractorName)} (${escapeHtml(data.contractorEmail)})</p>
        <p><span class="label">Tender:</span> ${escapeHtml(data.tenderName)} (ID: ${data.tenderId})</p>
        <p><span class="label">Request Type:</span> ${requestTypeLabel}</p>
        <p><span class="label">Message:</span></p>
        <div class="blockquote">${escapeHtml(data.message).replace(/\n/g, "<br>")}</div>
        <p>Please respond to the contractor directly.</p>
        <div class="footer">
          © ${new Date().getFullYear()} Beauty One International Pte Ltd<br>
          This is an automated message — please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: data.pmEmail,
    subject,
    html,
  });
}