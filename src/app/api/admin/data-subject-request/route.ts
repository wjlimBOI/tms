// app/api/admin/data-subject-request/route.ts
//
// Admin-facing PDPA "right of access" tool (Privacy Policy §4): lets Admin/
// Legal Team look up a user and retrieve everything the system holds about
// them in one place, instead of manually querying a dozen tables by hand
// when a data subject request comes in. Three-step flow: ?search= (paged)
// to find the right person, ?user_id= to pull page 1 of every category,
// then ?user_id=&section=&page= to page further into just one category
// ("Load more") without re-fetching everything else. Every full-bundle
// retrieval is itself written to audit_log (it's a sensitive action that
// surfaces a person's complete data footprint) so there's a record of who
// pulled whose data and when.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCorsHeaders, handleCorsOptions } from "@/lib/cors";
import { logEvent, extractAuditContext } from "@/lib/audit";
import { z } from "zod";
import { ROLE_IDS, isSuperUser } from "@/lib/roles";

export async function isAuthorized(userId: number): Promise<boolean> {
  const userRoles = await prisma.user_roles.findMany({
    where: { user_id: userId },
    select: { role_id: true },
  });
  const roleIds = userRoles.map((ur) => ur.role_id);
  return isSuperUser(roleIds) || roleIds.includes(ROLE_IDS.LEGAL_TEAM);
}

const SECTION_NAMES = [
  "loginHistory",
  "auditEntries",
  "tenderInterest",
  "submissions",
  "messages",
  "notifications",
  "emailLog",
  "documentsUploaded",
] as const;
type SectionName = (typeof SECTION_NAMES)[number];

const querySchema = z.object({
  search: z.string().trim().min(1).max(150).optional(),
  search_page: z.coerce.number().int().positive().default(1),
  user_id: z.coerce.number().int().positive().optional(),
  section: z.enum(SECTION_NAMES).optional(),
  page: z.coerce.number().int().positive().default(1),
});

const SEARCH_PAGE_SIZE = 10;
const SECTION_PAGE_SIZE = 25;

// One entry per data category: how to count and how to fetch one page,
// keyed by section name so /search-and-page-one-category (the "Load more"
// path) and /full-bundle (the initial retrieval) can share the same logic.
const sectionQueries: Record<
  SectionName,
  {
    count: (userId: number) => Promise<number>;
    page: (userId: number, skip: number, take: number) => Promise<any[]>;
  }
> = {
  loginHistory: {
    count: (userId) => prisma.login_history.count({ where: { user_id: userId } }),
    page: (userId, skip, take) =>
      prisma.login_history.findMany({
        where: { user_id: userId },
        select: { login_time: true, logout_time: true, login_status: true, ip_address: true, ip_location: true, device_type: true, browser: true },
        orderBy: { login_time: "desc" },
        skip,
        take,
      }),
  },
  auditEntries: {
    count: (userId) => prisma.audit_log.count({ where: { changed_by: userId } }),
    page: async (userId, skip, take) => {
      const rows = await prisma.audit_log.findMany({
        where: { changed_by: userId },
        select: { audit_id: true, table_name: true, record_id: true, action: true, changed_at: true },
        orderBy: { changed_at: "desc" },
        skip,
        take,
      });
      return rows.map((a) => ({ ...a, audit_id: Number(a.audit_id) }));
    },
  },
  tenderInterest: {
    count: (userId) => prisma.tender_interest.count({ where: { contractor_id: userId } }),
    page: (userId, skip, take) =>
      prisma.tender_interest.findMany({
        where: { contractor_id: userId },
        select: { interest_id: true, is_approved: true, created_at: true, tender: { select: { tender_name: true } } },
        orderBy: { created_at: "desc" },
        skip,
        take,
      }),
  },
  submissions: {
    count: (userId) => prisma.tender_submission.count({ where: { contractor_id: userId } }),
    page: (userId, skip, take) =>
      prisma.tender_submission.findMany({
        where: { contractor_id: userId },
        select: { submission_id: true, bq_name: true, status: true, round_no: true, submitted_at: true, created_at: true, tender: { select: { tender_name: true } } },
        orderBy: { created_at: "desc" },
        skip,
        take,
      }),
  },
  messages: {
    count: (userId) => prisma.tender_message.count({ where: { sender_id: userId } }),
    page: (userId, skip, take) =>
      prisma.tender_message.findMany({
        where: { sender_id: userId },
        select: { message_id: true, body: true, is_announcement: true, created_at: true, tender: { select: { tender_name: true } } },
        orderBy: { created_at: "desc" },
        skip,
        take,
      }),
  },
  notifications: {
    count: (userId) => prisma.notifications.count({ where: { user_id: userId } }),
    page: (userId, skip, take) =>
      prisma.notifications.findMany({
        where: { user_id: userId },
        select: { notification_id: true, title: true, created_at: true, is_read: true },
        orderBy: { created_at: "desc" },
        skip,
        take,
      }),
  },
  emailLog: {
    count: (userId) => prisma.email_notification_log.count({ where: { recipient_user_id: userId } }),
    page: (userId, skip, take) =>
      prisma.email_notification_log.findMany({
        where: { recipient_user_id: userId },
        select: { log_id: true, event_type: true, recipient_email: true, is_delivered: true, sent_at: true },
        orderBy: { sent_at: "desc" },
        skip,
        take,
      }),
  },
  documentsUploaded: {
    count: (userId) => prisma.tender_document.count({ where: { uploaded_by: userId } }),
    page: async (userId, skip, take) => {
      const rows = await prisma.tender_document.findMany({
        where: { uploaded_by: userId },
        select: { document_id: true, file_name: true, file_size: true, created_at: true, tender: { select: { tender_name: true } } },
        orderBy: { created_at: "desc" },
        skip,
        take,
      });
      return rows.map((d) => ({ ...d, file_size: Number(d.file_size) }));
    },
  },
};

async function fetchSectionPage(section: SectionName, userId: number, page: number) {
  const skip = (page - 1) * SECTION_PAGE_SIZE;
  const [total, rows] = await Promise.all([
    sectionQueries[section].count(userId),
    sectionQueries[section].page(userId, skip, SECTION_PAGE_SIZE),
  ]);
  return { rows, total, page, pageSize: SECTION_PAGE_SIZE, hasMore: skip + rows.length < total };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsResponse = handleCorsOptions(origin);
  if (corsResponse) return corsResponse;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const session = await getServerSession(authOptions);
  if (!session || !(await isAuthorized(Number(session.user.id)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
  }

  const parsed = querySchema.safeParse({
    search: request.nextUrl.searchParams.get("search") || undefined,
    search_page: request.nextUrl.searchParams.get("search_page") || undefined,
    user_id: request.nextUrl.searchParams.get("user_id") || undefined,
    section: request.nextUrl.searchParams.get("section") || undefined,
    page: request.nextUrl.searchParams.get("page") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.issues },
      { status: 400, headers: corsHeaders }
    );
  }
  const { search, search_page, user_id, section, page } = parsed.data;

  // ─── Step 1: search for the person (paged) ─────────────────────
  if (search) {
    const where = {
      is_deleted: false,
      OR: [
        { username: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
        { display_name: { contains: search, mode: "insensitive" as const } },
      ],
    };
    const skip = (search_page - 1) * SEARCH_PAGE_SIZE;
    const [total, matches] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        where,
        select: {
          user_id: true,
          username: true,
          email: true,
          display_name: true,
          is_active: true,
          roles: { select: { display_name: true, role_name: true } },
        },
        skip,
        take: SEARCH_PAGE_SIZE,
        orderBy: { username: "asc" },
      }),
    ]);

    return NextResponse.json(
      {
        matches: matches.map((m) => ({
          user_id: m.user_id,
          username: m.username,
          email: m.email,
          display_name: m.display_name,
          is_active: m.is_active,
          role: m.roles.display_name || m.roles.role_name,
        })),
        total,
        page: search_page,
        pageSize: SEARCH_PAGE_SIZE,
        hasMore: skip + matches.length < total,
      },
      { headers: corsHeaders }
    );
  }

  if (!user_id) {
    return NextResponse.json(
      { error: "Provide either 'search' or 'user_id'" },
      { status: 400, headers: corsHeaders }
    );
  }

  // ─── Step 2b: page further into a single category ("Load more") ─
  // Doesn't re-fetch the profile or re-log a PDPA access event — that
  // already happened when the bundle was first retrieved (step 2a below).
  if (section) {
    const result = await fetchSectionPage(section, user_id, page);
    return NextResponse.json({ section, ...result }, { headers: corsHeaders });
  }

  // ─── Step 2a: retrieve the full data bundle (page 1 of everything) ──
  const target = await prisma.users.findUnique({
    where: { user_id },
    select: {
      user_id: true,
      username: true,
      email: true,
      display_name: true,
      job_title: true,
      employee_code: true,
      is_active: true,
      is_approved: true,
      is_team_member: true,
      last_login: true,
      created_at: true,
      access_start_date: true,
      access_end_date: true,
      roles: { select: { display_name: true, role_name: true } },
      user_profile: {
        select: { full_name: true, company_name: true, department: true, job_title: true, phone: true },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers: corsHeaders });
  }

  const entries = await Promise.all(
    SECTION_NAMES.map(async (name) => [name, await fetchSectionPage(name, user_id, 1)] as const)
  );
  const sections = Object.fromEntries(entries) as Record<SectionName, Awaited<ReturnType<typeof fetchSectionPage>>>;

  // Every retrieval of a full PII bundle is itself a sensitive, auditable
  // action — separate from the routine per-table access logging.
  const ctx = extractAuditContext(request);
  await logEvent({
    tableName: "users",
    recordId: user_id,
    action: "PDPA_ACCESS_REQUEST",
    userId: Number(session.user.id),
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    details: { ...ctx.details, target_user_id: user_id, target_username: target.username },
  });

  return NextResponse.json(
    {
      profile: {
        ...target,
        role: target.roles.display_name || target.roles.role_name,
        roles: undefined,
      },
      loginHistory: sections.loginHistory,
      auditEntries: sections.auditEntries,
      tenderInterest: sections.tenderInterest,
      submissions: sections.submissions,
      messages: sections.messages,
      notifications: sections.notifications,
      emailLog: sections.emailLog,
      documentsUploaded: sections.documentsUploaded,
    },
    { headers: corsHeaders }
  );
}
