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

function sanitizeEmailSubject(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function sendSecureMail(options: Parameters<typeof transporter.sendMail>[0]) {
  return transporter.sendMail({
    ...options,
    subject: sanitizeEmailSubject(typeof options.subject === "string" ? options.subject : ""),
  });
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

// ============================================================
// Shared email template — every function below routes through
// this single renderer so header, title placement, button style,
// and footer are consistent across all outbound mail. Built as a
// table-based layout (not divs/flexbox) with MSO conditional
// comments for the button, matching what actually renders
// correctly across desktop Outlook, webmail, and mobile mail apps.
// ============================================================
function renderEmail({
  title,
  bodyHtml,
  cta,
}: {
  title: string;
  bodyHtml: string;
  cta?: { text: string; url: string };
}): string {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const isLocalhost = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  const logoSrc = isLocalhost
    ? getLogoDataUri() || `${baseUrl}/logos/boi.png`
    : `${baseUrl}/logos/boi.png`;

  const ctaHtml = cta
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;">
        <tr>
          <td align="center">
            <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta.url}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="12%" stroke="f" fillcolor="#0d9488">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;">${escapeHtml(cta.text)}</center>
              </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-- -->
              <a href="${cta.url}" class="button" style="display:inline-block;background-color:#0d9488;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:40px;">${escapeHtml(cta.text)}</a>
            <!--<![endif]-->
          </td>
        </tr>
      </table>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light">
      <meta name="supported-color-schemes" content="light">
      <title>${escapeHtml(title)}</title>
      <style>
        html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        /* Outlook.com/Hotmail wraps the message body in its own
           <div class="ExternalClass">, which has a default line-height
           that shows up as extra space above/below the content unless
           reset explicitly. */
        .ExternalClass { width: 100%; }
        .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; }
          .content { padding-left: 20px !important; padding-right: 20px !important; }
          .button { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box; }
        }
      </style>
    </head>
    <body bgcolor="#eef1f6" style="margin:0;padding:0;background-color:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
      <center style="width:100%;table-layout:fixed;">
        <table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" class="container" style="max-width:600px;width:100%;background-color:#ffffff;margin:0 auto;border:1px solid #e0e7ef;">

          <!-- Header -->
          <tr>
            <td bgcolor="#0f2b3d" style="background-color:#0f2b3d;padding:24px 24px 20px;text-align:center;">
              <img src="${logoSrc}" alt="Beauty One International" width="180" style="display:block;max-width:180px;width:100%;height:auto;margin:0 auto 14px auto;border:0;" />
              <span style="display:inline-block;color:#f1f5f9;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;border-bottom:1px solid rgba(241,245,249,0.35);padding-bottom:7px;">Tender Management System</span>
            </td>
          </tr>

          <!-- Accent divider -->
          <tr>
            <td style="line-height:0;font-size:0;">
              <div style="height:3px;background-color:#0d9488;"></div>
            </td>
          </tr>

          <!-- Title + Body — own background, visually distinct from header/footer -->
          <tr>
            <td bgcolor="#ffffff">
              <div class="content" style="padding:30px 28px 0;text-align:center;">
                <h1 style="font-size:20px;font-weight:700;color:#1a2c3e;margin:0;">${escapeHtml(title)}</h1>
              </div>
              <div class="content" style="padding:16px 28px 30px;font-size:15px;line-height:1.6;color:#334155;">
                ${bodyHtml}
                ${ctaHtml}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#e9eef5" style="background-color:#e9eef5;border-top:1px solid #dbe3ee;padding:20px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#475569;">
                This is an automated message — please do not reply.
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                © ${new Date().getFullYear()} Beauty One International Pte Ltd. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </center>
    </body>
    </html>
  `;
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
  const title = "Welcome to the Tender Management System";

  const body = `
    <p style="margin:0 0 16px;">Dear ${escapeHtml(username)},</p>
    <p style="margin:0 0 20px;">
      Your account for the <strong>Beauty One International Tender Management System</strong> has been created successfully. Your sign-in details are below.
    </p>

    <table width="100%" cellpadding="16" cellspacing="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;margin:4px 0 20px;">
      <tr>
        <td style="border-bottom:1px solid #e2e8f0;">
          <span style="font-size:12px;font-weight:600;color:#0f3b5c;letter-spacing:0.5px;">USERNAME</span><br/>
          <span style="font-size:17px;font-weight:500;color:#0f172a;">${escapeHtml(username)}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span style="font-size:12px;font-weight:600;color:#0f3b5c;letter-spacing:0.5px;">TEMPORARY PASSWORD</span><br/>
          <span style="display:inline-block;background-color:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;font-family:monospace;font-size:16px;font-weight:600;color:#0f3b5c;margin-top:6px;">${escapeHtml(tempPassword)}</span>
        </td>
      </tr>
    </table>

    <div style="background-color:#fffbeb;border-radius:8px;padding:14px 18px;margin:4px 0 20px;text-align:left;">
      <span style="font-size:13px;color:#92400e;">
        <strong>Important:</strong> Please set your own password immediately. This link expires in 24 hours.
      </span>
    </div>

    <p style="font-size:13px;color:#64748b;margin:0;">
      If you did not request this account, please ignore this email or contact your system administrator.
    </p>
  `;

  await sendSecureMail({
    from: `"Beauty One International" <${process.env.SMTP_FROM}>`,
    to: email,
    subject: "Welcome to Beauty One International – Set Your Password",
    html: renderEmail({ title, bodyHtml: body, cta: { text: "Set Your Password", url: setPasswordUrl } }),
  });
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
  const title = "Tender Extension Request";

  const body = `
    <p style="margin:0 0 10px;"><strong>Tender:</strong> ${escapeHtml(data.tenderName)} (ID: ${data.tenderId})</p>
    <p style="margin:0 0 10px;"><strong>Requested by:</strong> ${escapeHtml(data.requestedBy)}</p>
    <p style="margin:0 0 10px;"><strong>Additional Days:</strong> ${data.requestedDays}</p>
    <p style="margin:0 0 6px;"><strong>Reason:</strong></p>
    <div style="background-color:#f8fafc;padding:12px 16px;border-left:4px solid #0d9488;margin:0 0 14px;text-align:left;">${escapeHtml(data.reason).replace(/\n/g, "<br>")}</div>
    <p style="margin:0 0 6px;"><span style="font-weight:600;color:#334155;">Original Closing:</span> ${new Date(data.originalClosing).toLocaleString()}</p>
    <p style="margin:0 0 14px;"><span style="font-weight:600;color:#334155;">Proposed Closing:</span> ${new Date(data.proposedClosing).toLocaleString()}</p>
    <p style="font-size:13px;color:#64748b;margin:0;">
      You are receiving this email because you are an approver or have been CC'd on this request.
    </p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: data.approverEmails.join(", "),
    cc: data.ccEmails.join(", "),
    subject: `Tender Extension Request: ${data.tenderName}`,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "Review & Approve", url: reviewUrl } }),
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
  const title = `Extension Request ${data.status}`;
  const subject = `Extension ${data.status}: ${data.tenderName}`;

  const badgeColor = data.status === "Approved" ? { bg: "#d1fae5", fg: "#065f46" } : { bg: "#fee2e2", fg: "#991b1b" };

  const body = `
    <p style="margin:0 0 10px;"><strong>Tender:</strong> ${escapeHtml(data.tenderName)}</p>
    <p style="margin:0 0 14px;">
      <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-weight:600;font-size:13px;background-color:${badgeColor.bg};color:${badgeColor.fg};">
        ${data.status}
      </span>
    </p>
    <p style="margin:0 0 6px;"><span style="font-weight:600;color:#334155;">Requested by:</span> ${escapeHtml(data.requesterName)}</p>
    <p style="margin:0 0 6px;"><span style="font-weight:600;color:#334155;">Original Closing:</span> ${new Date(data.originalClosing).toLocaleString()}</p>
    <p style="margin:0 0 14px;"><span style="font-weight:600;color:#334155;">Proposed Closing:</span> ${new Date(data.proposedClosing).toLocaleString()}</p>
    ${data.reason ? `<p style="margin:0;"><span style="font-weight:600;color:#334155;">Reason for ${data.status.toLowerCase()}:</span> ${escapeHtml(data.reason)}</p>` : ""}
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: data.requesterEmail,
    subject,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "View Tender", url: tenderUrl } }),
  });
}

// ==================== STAGE NOTIFICATION EMAIL ====================
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
  const title = "Tender Stage Updated";
  const subject = `Tender Stage Update: ${tenderName}`;

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 14px;">
      The tender <strong>${escapeHtml(tenderName)}</strong> (ID: ${tenderId})
      has been moved to <strong>${stageName}</strong> by <strong>${escapeHtml(performedBy)}</strong>.
    </p>
    <p style="margin:0;">Please review the tender and take the necessary action.</p>
  `;

  try {
    await sendSecureMail({
      from: `"TMS System" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      html: renderEmail({ title, bodyHtml: body, cta: { text: "View Tender", url: tenderUrl } }),
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
  const title = "New Request from Contractor";
  const subject = `New ${data.requestType === "drawings" ? "Drawings Request" : "Information Request"} for Tender: ${data.tenderName}`;

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(data.pmName)},</p>
    <p style="margin:0 0 10px;"><span style="font-weight:600;color:#334155;">Contractor:</span> ${escapeHtml(data.contractorName)} (${escapeHtml(data.contractorEmail)})</p>
    <p style="margin:0 0 10px;"><span style="font-weight:600;color:#334155;">Tender:</span> ${escapeHtml(data.tenderName)} (ID: ${data.tenderId})</p>
    <p style="margin:0 0 10px;"><span style="font-weight:600;color:#334155;">Request Type:</span> ${requestTypeLabel}</p>
    <p style="margin:0 0 6px;"><span style="font-weight:600;color:#334155;">Message:</span></p>
    <div style="background-color:#f8fafc;padding:12px 16px;border-left:4px solid #0d9488;margin:0 0 14px;text-align:left;">${escapeHtml(data.message).replace(/\n/g, "<br>")}</div>
    <p style="margin:0;">Please respond to the contractor directly.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: data.pmEmail,
    subject,
    html: renderEmail({ title, bodyHtml: body }),
  });
}

// ==================== AWARD RESULT EMAIL ====================
export async function sendAwardResultEmail({
  to,
  recipientName,
  tenderName,
  tenderId,
  won,
  contractValue,
  cc,
}: {
  to: string;
  recipientName: string;
  tenderName: string;
  tenderId: number;
  won: boolean;
  contractValue?: number;
  cc?: string[];
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const tenderUrl = `${baseUrl}/tenders/${tenderId}`;
  const subject = won ? `Congratulations — you won: ${tenderName}` : `Tender awarded: ${tenderName}`;
  const title = won ? "You've Been Awarded the Tender" : "Tender Award Result";

  const body = won
    ? `
        <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
        <p style="margin:0 0 14px;">Congratulations — you have been awarded <strong>${escapeHtml(tenderName)}</strong>.</p>
        ${contractValue != null ? `<p style="margin:0;"><span style="font-weight:600;color:#334155;">Contract Value:</span> $${contractValue.toLocaleString()}</p>` : ""}
      `
    : `
        <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
        <p style="margin:0 0 14px;"><strong>${escapeHtml(tenderName)}</strong> has been awarded to another contractor.</p>
        <p style="margin:0;">Thank you for your submission — we encourage you to bid on future tenders.</p>
      `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to,
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "View Tender", url: tenderUrl } }),
  });
}

// ==================== BQ DECISION EMAIL ====================
export async function sendBqDecisionEmail({
  to,
  recipientName,
  bqLabel,
  tenderName,
  status,
  submissionId,
  cc,
}: {
  to: string;
  recipientName: string;
  bqLabel: string;
  tenderName: string;
  status: "approved" | "rejected";
  submissionId: number;
  cc?: string[];
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const bqUrl = `${baseUrl}/bq/${submissionId}/view`;
  const subject = `BQ ${status === "approved" ? "Approved" : "Rejected"}: ${bqLabel}`;
  const title = status === "approved" ? "BQ Approved" : "BQ Rejected";

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0;">Your Bill of Quantities <strong>${escapeHtml(bqLabel)}</strong> for <strong>${escapeHtml(tenderName)}</strong> has been <strong>${status}</strong>.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to,
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "View BQ", url: bqUrl } }),
  });
}

// ==================== RESUBMISSION REQUEST EMAIL ====================
// Deliberately never includes exact competitor figures — only relative
// standing ("higher"/"lower" than other bids) — so a contractor can't infer
// another contractor's actual pricing from this email (2026-08-10).
export async function sendResubmissionRequestEmail({
  to,
  recipientName,
  tenderName,
  tenderId,
  standing,
  instructions,
  dueBy,
  cc,
}: {
  to: string;
  recipientName: string;
  tenderName: string;
  tenderId: number;
  standing: "higher" | "lower" | "mixed";
  instructions?: string | null;
  dueBy?: string | null;
  cc?: string[];
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const tenderUrl = `${baseUrl}/tenders/${tenderId}`;
  const subject = `Revised Quote Requested: ${tenderName}`;

  const standingText =
    standing === "higher"
      ? "your submitted pricing is on the higher end compared to other bids received"
      : standing === "lower"
      ? "your submitted pricing is on the lower end compared to other bids received"
      : "your submitted pricing varies compared to other bids received";

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 14px;">Following our review of <strong>${escapeHtml(tenderName)}</strong>, ${standingText}. We would like to invite you to review and submit a revised quote.</p>
    ${instructions ? `<p style="margin:0 0 14px;"><span style="font-weight:600;color:#334155;">Notes from our team:</span><br/>${escapeHtml(instructions)}</p>` : ""}
    ${dueBy ? `<p style="margin:0;"><span style="font-weight:600;color:#334155;">Please submit your revised quote by:</span> ${escapeHtml(dueBy)}</p>` : ""}
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to,
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    html: renderEmail({ title: "Revised Quote Requested", bodyHtml: body, cta: { text: "View Tender", url: tenderUrl } }),
  });
}

// ==================== DLP REMINDER EMAIL ====================
export async function sendDlpReminderEmail({
  to,
  recipientName,
  tenderName,
  tenderId,
  dueDate,
  cc,
}: {
  to: string;
  recipientName: string;
  tenderName: string;
  tenderId: number;
  dueDate: string;
  cc?: string[];
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const tenderUrl = `${baseUrl}/tenders/${tenderId}`;
  const subject = `DLP expiring soon: ${tenderName}`;
  const title = "Defect Liability Period Expiring Soon";

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0;">The Defect Liability Period for <strong>${escapeHtml(tenderName)}</strong> expires on <strong>${escapeHtml(dueDate)}</strong>.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to,
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "View Tender", url: tenderUrl } }),
  });
}

// ==================== SUBMISSION DEADLINE REMINDER EMAIL ====================
export async function sendSubmissionDeadlineReminderEmail({
  to,
  recipientName,
  tenderName,
  tenderId,
  closingDate,
  cc,
}: {
  to: string;
  recipientName: string;
  tenderName: string;
  tenderId: number;
  closingDate: string;
  cc?: string[];
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const tenderUrl = `${baseUrl}/tenders/${tenderId}`;
  const subject = `Submission deadline approaching: ${tenderName}`;
  const title = "Submission Deadline Approaching";

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0;"><strong>${escapeHtml(tenderName)}</strong> closes on <strong>${escapeHtml(closingDate)}</strong>. Submit your bid before then.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to,
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "Submit Bid", url: tenderUrl } }),
  });
}

// ==================== TENDER INVITATION EMAIL ====================
export async function sendInvitationEmail({
  to,
  contractorName,
  tenderName,
  token,
  subject: templateSubject,
  body: templateBody,
}: {
  to: string;
  contractorName: string;
  tenderName: string;
  token: string;
  subject: string;
  body: string;
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const respondUrl = `${baseUrl}/tender-interest/respond?token=${token}`;
  const subject = templateSubject
    .replace(/\{contractor_name\}/g, contractorName)
    .replace(/\{tender_name\}/g, tenderName);
  const title = "Tender Invitation";

  const resolvedBody = templateBody
    .replace(/\{contractor_name\}/g, contractorName)
    .replace(/\{tender_name\}/g, tenderName);

  const body = `
    <div style="background-color:#f8fafc;padding:12px 16px;border-left:4px solid #0d9488;margin:0 0 14px;text-align:left;">${escapeHtml(resolvedBody).replace(/\n/g, "<br>")}</div>
    <p style="font-size:13px;color:#64748b;margin:0;">You can respond directly using the button below, or log in to your TMS account to view and respond to this invitation.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to,
    subject,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "Respond to Invitation", url: respondUrl } }),
  });
}

// ==================== PASSWORD RESET (ADMIN-TRIGGERED) EMAIL ====================
export async function sendPasswordResetEmail(
  email: string,
  username: string,
  tempPassword: string,
  token: string
): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "";
  const setPasswordUrl = `${baseUrl}/set-password?token=${token}`;
  const subject = "Your TMS password has been reset";
  const title = "Password Reset";

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(username)},</p>
    <p style="margin:0 0 14px;">An administrator has reset your password for the Tender Management System.</p>
    <p style="margin:0 0 14px;"><span style="font-weight:600;color:#334155;">Temporary Password:</span> <span style="font-family:monospace;">${escapeHtml(tempPassword)}</span></p>
    <p style="margin:0 0 14px;">Please set a new password using the button below.</p>
    <p style="font-size:13px;color:#dc2626;font-weight:600;margin:0;">If you did not expect this, contact your administrator immediately.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: email,
    subject,
    html: renderEmail({ title, bodyHtml: body, cta: { text: "Set New Password", url: setPasswordUrl } }),
  });
}

// ==================== LOGIN ALERT EMAIL ====================
export async function sendLoginAlertEmail(
  email: string,
  username: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  const subject = "New login to your TMS account";
  const title = "Login Alert";

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(username)},</p>
    <p style="margin:0 0 14px;">A login to your TMS account was just recorded:</p>
    <p style="margin:0 0 6px;"><span style="font-weight:600;color:#334155;">IP Address:</span> ${escapeHtml(ipAddress)}</p>
    <p style="margin:0 0 14px;"><span style="font-weight:600;color:#334155;">Device/Browser:</span> ${escapeHtml(userAgent)}</p>
    <p style="font-size:13px;color:#dc2626;font-weight:600;margin:0;">If this wasn't you, contact your administrator immediately.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to: email,
    subject,
    html: renderEmail({ title, bodyHtml: body }),
  });
}

// ==================== PDPA DATA SUBJECT REQUEST SUMMARY EMAIL ====================
// Sent by an Admin/Legal Team member from admin/security's Data Subject
// Request tool, compiling what TMS holds on the recipient into a short
// summary (AI-generated with a deterministic local fallback — see
// src/app/api/admin/data-subject-request/summary/route.ts) for a PDPA
// "right of access" response. summaryText may contain the admin's manual
// edits, so it's escaped like any other user-influenced content before
// interpolation, and rendered with line breaks preserved.
export async function sendDsrSummaryEmail({
  to,
  recipientName,
  summaryText,
}: {
  to: string;
  recipientName: string;
  summaryText: string;
}): Promise<void> {
  const subject = "Your TMS data summary";
  const title = "Your TMS Data Summary";

  const body = `
    <p style="margin:0 0 14px;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 14px;">Further to your data access request, here is a summary of the information Beauty One International Pte Ltd. holds about you in the Tender Management System (TMS):</p>
    <p style="margin:0 0 14px;white-space:pre-wrap;">${escapeHtml(summaryText)}</p>
    <p style="font-size:13px;color:#64748b;margin:0;">If you have questions about this summary or would like to exercise any of your rights under the PDPA, please contact our Data Protection Officer at dpo@beautyone.com.sg.</p>
  `;

  await sendSecureMail({
    from: `"TMS System" <${process.env.SMTP_FROM}>`,
    to,
    subject,
    html: renderEmail({ title, bodyHtml: body }),
  });
}

