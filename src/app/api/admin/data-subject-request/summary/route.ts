// app/api/admin/data-subject-request/summary/route.ts
//
// Generates a short, factual summary of what TMS holds on a given user, for
// an Admin/Legal Team member to review, edit, and send as part of fulfilling
// a PDPA "right of access" request (see the parent data-subject-request
// route). Follows the same getAnthropicClient -> local-fallback pattern as
// src/app/api/bq/[submissionId]/finance-summary/route.ts. Nothing here is
// persisted — a summary is generated fresh each time, since the underlying
// full-bundle retrieval is already the auditable event (logged by the
// parent GET route); this endpoint only re-counts, it doesn't re-expose
// row-level detail.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { getAnthropicClient } from "@/lib/anthropic";
import { isAuthorized } from "../route";
import { z } from "zod";

const bodySchema = z.object({
  user_id: z.coerce.number().int().positive(),
  detail_level: z.enum(["summary", "detailed"]).default("summary"),
});

// Cap on rows listed per category in "detailed" mode — keeps the email
// readable and inside the 5000-char cap send/route.ts enforces on
// summary_text, even for a person with a long history in one category.
const DETAILED_ROWS_PER_CATEGORY = 10;

async function buildAiSummary(
  profileLines: string[],
  recordRows: string[]
): Promise<string | null> {
  let client;
  try {
    client = getAnthropicClient();
  } catch {
    return null;
  }

  const lines = [
    "Account profile:",
    ...profileLines.map((l) => `- ${l}`),
    "",
    "Records held per category:",
    ...recordRows.map((l) => `- ${l}`),
  ];

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 400,
      output_config: { effort: "low" },
      system:
        "You are a compliance assistant helping an admin respond to a PDPA data access request. Given a person's TMS account profile and a per-category count of records held about them, write the summary that will be emailed directly to that person as part of the response to their request. " +
        "Format it as plain text organised under two clearly labelled sections, in this exact shape:\n\n" +
        "Account Profile\n- <field>: <value>\n(one line per profile fact, unchanged from the input)\n\n" +
        "Records Held\n- <count> <category>\n(one line per category, unchanged from the input; do not merge categories into a sentence)\n\n" +
        "Do not add a greeting, sign-off, or closing remark (those are added separately). Do not speculate beyond the given facts. Do not use markdown syntax (no #, *, or **) — use the plain '- ' bullet prefix and blank lines exactly as shown above so it renders cleanly in a plain-text email.",
      messages: [{ role: "user", content: lines.join("\n") }],
    });
    if (response.stop_reason === "refusal") return null;
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    return text || null;
  } catch (error) {
    console.error("dsr-summary: Anthropic call failed, falling back to local summary:", error);
    return null;
  }
}

// Plain-text, not prose — the AI summary above is asked to match this same
// shape, so a large record count reads as a scannable list either way
// instead of one run-on sentence (see sendDsrSummaryEmail's white-space:
// pre-wrap, which preserves these line breaks in the actual email).
function buildLocalSummary(profileLines: string[], recordRows: string[]): string {
  return [
    "Account Profile",
    ...profileLines.map((l) => `- ${l}`),
    "",
    "Records Held",
    ...recordRows.map((l) => `- ${l}`),
  ].join("\n");
}

interface DetailedCategory {
  heading: string;
  total: number;
  entries: string[];
}

// One section per category, each entry a single factual line (date + the
// one or two fields that identify the record — never full message bodies
// or other free-text content, since this goes straight into an email to
// the data subject). Deliberately NOT run through the AI: this is exact
// row-level content being disclosed as part of a PDPA response, so it's
// built the same deterministic way every time rather than paraphrased.
function buildDetailedSummary(profileLines: string[], categories: DetailedCategory[]): string {
  const sections = categories.map((cat) => {
    const shown = cat.entries.length;
    const suffix =
      cat.total === 0
        ? " — none"
        : shown < cat.total
          ? ` (${cat.total} total, showing ${shown} most recent)`
          : ` (${cat.total} total)`;
    const lines = cat.entries.length > 0 ? cat.entries.map((l) => `- ${l}`) : [];
    return [`${cat.heading}${suffix}`, ...lines].join("\n");
  });

  return [
    "Account Profile",
    ...profileLines.map((l) => `- ${l}`),
    "",
    ...sections,
  ].join("\n\n");
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAuthorized(Number(session.user.id)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { user_id, detail_level } = parsed.data;

  const target = await prisma.users.findUnique({
    where: { user_id },
    select: {
      username: true,
      email: true,
      display_name: true,
      created_at: true,
      last_login: true,
      is_active: true,
      roles: { select: { display_name: true, role_name: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers: corsHeaders });
  }

  const [
    loginHistoryCount,
    auditEntriesCount,
    tenderInterestCount,
    submissionsCount,
    messagesCount,
    notificationsCount,
    emailLogCount,
    documentsUploadedCount,
  ] = await Promise.all([
    prisma.login_history.count({ where: { user_id } }),
    prisma.audit_log.count({ where: { changed_by: user_id } }),
    prisma.tender_interest.count({ where: { contractor_id: user_id } }),
    prisma.tender_submission.count({ where: { contractor_id: user_id } }),
    prisma.tender_message.count({ where: { sender_id: user_id } }),
    prisma.notifications.count({ where: { user_id } }),
    prisma.email_notification_log.count({ where: { recipient_user_id: user_id } }),
    prisma.tender_document.count({ where: { uploaded_by: user_id } }),
  ]);

  const displayName = target.display_name || target.username;
  const role = target.roles.display_name || target.roles.role_name;

  const profileLines = [
    `Name: ${displayName}`,
    `Email: ${target.email}`,
    `Role: ${role}`,
    `Account status: ${target.is_active ? "Active" : "Inactive"}`,
    `Account created: ${target.created_at.toISOString().slice(0, 10)}`,
    `Last login: ${target.last_login ? target.last_login.toISOString().slice(0, 10) : "No recorded login yet"}`,
  ];

  const recordRows = [
    `${loginHistoryCount} login history entries`,
    `${auditEntriesCount} audit log entries`,
    `${tenderInterestCount} tender interest expressions`,
    `${submissionsCount} BQ/tender submissions`,
    `${messagesCount} messages sent`,
    `${notificationsCount} in-app notifications`,
    `${emailLogCount} emails sent to this person`,
    `${documentsUploadedCount} documents uploaded by this person`,
  ];

  if (detail_level === "detailed") {
    const take = DETAILED_ROWS_PER_CATEGORY;
    const [loginRows, auditRows, interestRows, submissionRows, messageRows, notificationRows, emailRows, documentRows] =
      await Promise.all([
        prisma.login_history.findMany({
          where: { user_id },
          select: { login_time: true, login_status: true, ip_address: true },
          orderBy: { login_time: "desc" },
          take,
        }),
        prisma.audit_log.findMany({
          where: { changed_by: user_id },
          select: { table_name: true, action: true, changed_at: true },
          orderBy: { changed_at: "desc" },
          take,
        }),
        prisma.tender_interest.findMany({
          where: { contractor_id: user_id },
          select: { created_at: true, tender: { select: { tender_name: true } } },
          orderBy: { created_at: "desc" },
          take,
        }),
        prisma.tender_submission.findMany({
          where: { contractor_id: user_id },
          select: { created_at: true, status: true, round_no: true, tender: { select: { tender_name: true } } },
          orderBy: { created_at: "desc" },
          take,
        }),
        prisma.tender_message.findMany({
          where: { sender_id: user_id },
          select: { created_at: true, tender: { select: { tender_name: true } } },
          orderBy: { created_at: "desc" },
          take,
        }),
        prisma.notifications.findMany({
          where: { user_id },
          select: { created_at: true, title: true },
          orderBy: { created_at: "desc" },
          take,
        }),
        prisma.email_notification_log.findMany({
          where: { recipient_user_id: user_id },
          select: { sent_at: true, event_type: true, is_delivered: true },
          orderBy: { sent_at: "desc" },
          take,
        }),
        prisma.tender_document.findMany({
          where: { uploaded_by: user_id },
          select: { created_at: true, file_name: true, tender: { select: { tender_name: true } } },
          orderBy: { created_at: "desc" },
          take,
        }),
      ]);

    const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

    const categories: DetailedCategory[] = [
      {
        heading: "Login History",
        total: loginHistoryCount,
        entries: loginRows.map((r) => `${ymd(r.login_time)} — ${r.login_status}${r.ip_address ? ` (${r.ip_address})` : ""}`),
      },
      {
        heading: "Audit Log Entries",
        total: auditEntriesCount,
        entries: auditRows.map((r) => `${ymd(r.changed_at)} — ${r.action} on ${r.table_name}`),
      },
      {
        heading: "Tender Interest Expressions",
        total: tenderInterestCount,
        entries: interestRows.map((r) => `${ymd(r.created_at)} — "${r.tender.tender_name}"`),
      },
      {
        heading: "BQ/Tender Submissions",
        total: submissionsCount,
        entries: submissionRows.map((r) => `${ymd(r.created_at)} — "${r.tender.tender_name}" (${r.status}, Round ${r.round_no})`),
      },
      {
        heading: "Messages Sent",
        total: messagesCount,
        entries: messageRows.map((r) => `${ymd(r.created_at)} — on "${r.tender.tender_name}"`),
      },
      {
        heading: "In-App Notifications",
        total: notificationsCount,
        entries: notificationRows.map((r) => `${ymd(r.created_at)} — ${r.title}`),
      },
      {
        heading: "Emails Sent to This Person",
        total: emailLogCount,
        entries: emailRows.map((r) => `${ymd(r.sent_at)} — ${r.event_type} (${r.is_delivered ? "delivered" : "failed"})`),
      },
      {
        heading: "Documents Uploaded by This Person",
        total: documentsUploadedCount,
        entries: documentRows.map((r) => `${ymd(r.created_at)} — "${r.file_name}" on "${r.tender.tender_name}"`),
      },
    ];

    const summary = buildDetailedSummary(profileLines, categories);
    return NextResponse.json({ summary }, { headers: corsHeaders });
  }

  const aiSummary = await buildAiSummary(profileLines, recordRows);
  const summary = aiSummary ?? buildLocalSummary(profileLines, recordRows);

  return NextResponse.json({ summary }, { headers: corsHeaders });
}
