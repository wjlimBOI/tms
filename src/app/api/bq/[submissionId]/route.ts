import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

async function getUserIdFromSession(session: any): Promise<number | null> {
  if (session.user?.id) return session.user.id;
  if (session.user?.userId) return session.user.userId;
  const identifier = session.user?.email || session.user?.name;
  if (!identifier) return null;
  const res = await query(
    `SELECT user_id FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
    [identifier]
  );
  return res.rows[0]?.user_id || null;
}

// GET – returns submission data and items
export async function GET(
  req: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getUserIdFromSession(session);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { submissionId: submissionIdStr } = await params;
  const submissionId = parseInt(submissionIdStr, 10);
  if (isNaN(submissionId)) return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });

  try {
    // 1. Submission header – removed join with users table
    const subRes = await query(
      `SELECT
          ts.submission_id,
          ts.tender_id,
          ts.contractor_id,
          ts.round_no,
          ts.version_name,
          ts.status,
          ts.updated_at,
          ts.last_edit_at,
          ts.created_at,
          ts.bq_date,
          ts.area_size,
          ts.logo_url,
          ts.client_name_override,
          ts.branch_name_override,
          ts.renovation_type_override,
          ts.bq_name,
          t.tender_name,
          b.branch_name AS original_branch_name,
          br.brand_name,
          rt.type_id AS renovation_type_id,
          rt.type_name AS renovation_type_name
       FROM tender_submission ts
       JOIN tender t ON ts.tender_id = t.tender_id
       JOIN branch b ON t.branch_id = b.branch_id
       JOIN brand br ON b.brand_id = br.brand_id
       JOIN renovation_type rt ON t.renovation_type_id = rt.type_id
       WHERE ts.submission_id = $1`,
      [submissionId]
    );

    if (subRes.rows.length === 0) {
      return NextResponse.json({ error: "BQ not found" }, { status: 404 });
    }
    const submission = subRes.rows[0];

    // 2. Permissions – use session roles
    const userRoleIds = (session.user as any)?.roleIds || [];
    const isAdmin = userRoleIds.includes(1);
    const isContractor = userRoleIds.includes(13);

    let canEdit = false;
    if (isAdmin) {
      canEdit = true;
    } else if (isContractor) {
      const ownsSubmission = submission.contractor_id === userId;
      if (ownsSubmission) {
        // Get latest round for this tender and contractor
        const latestRes = await query(
          `SELECT MAX(round_no) as max_round FROM tender_submission
           WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false`,
          [submission.tender_id, submission.contractor_id]
        );
        const maxRound = latestRes.rows[0]?.max_round || 0;
        const isLatest = submission.round_no === maxRound;
        const isDraft = submission.status === 'Draft';
        canEdit = isDraft && isLatest;
      }
    }

    // 3. Categories
    const catsRes = await query(
      `SELECT c.category_id, c.category_name, c.sort_order
       FROM submission_category sc
       JOIN work_category c ON sc.category_id = c.category_id
       WHERE sc.submission_id = $1
       ORDER BY sc.sort_order`,
      [submissionId]
    );
    const categories = catsRes.rows;

    // 4. Items – from bq_line_item
    const itemsRes = await query(
      `WITH 
        category_ordering AS (
          SELECT DISTINCT li.category_id, c.sort_order
          FROM bq_line_item li
          JOIN work_category c ON li.category_id = c.category_id
          WHERE li.submission_id = $1
        ),
        numbered_categories AS (
          SELECT 
            category_id,
            ROW_NUMBER() OVER (ORDER BY sort_order) as cat_num
          FROM category_ordering
        )
      SELECT 
        li.line_item_id,
        li.category_id,
        li.parent_item_id,
        li.location,
        li.description,
        li.specifications,
        li.brand,
        li.quantity,
        li.unit,
        li.unit_price,
        li.discount,
        li.amount,
        li.sort_order,
        c.category_name,
        CONCAT(nc.cat_num, '.', ROW_NUMBER() OVER (PARTITION BY li.category_id ORDER BY li.sort_order)) as item_no
      FROM bq_line_item li
      JOIN work_category c ON li.category_id = c.category_id
      JOIN numbered_categories nc ON li.category_id = nc.category_id
      WHERE li.submission_id = $1
      ORDER BY nc.cat_num, li.sort_order`,
      [submissionId]
    );
    const items = itemsRes.rows;

    return NextResponse.json({ submission, categories, items, canEdit });
  } catch (error) {
    console.error("Error fetching BQ data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH – admin approval/rejection (unchanged except role check)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getUserIdFromSession(session);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { submissionId: submissionIdStr } = await params;
  const submissionId = parseInt(submissionIdStr, 10);
  if (isNaN(submissionId)) return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });

  const body = await req.json();
  const { status: newStatus } = body;

  if (!newStatus || !["approved", "rejected"].includes(newStatus)) {
    return NextResponse.json(
      { error: "Invalid status. Use 'approved' or 'rejected'." },
      { status: 400 }
    );
  }

  const titleCaseStatus = newStatus === 'approved' ? 'Approved' : 'Rejected';

  try {
    // Get current status and user roles
    const subRes = await query(
      `SELECT ts.status FROM tender_submission ts WHERE ts.submission_id = $1`,
      [submissionId]
    );
    if (subRes.rows.length === 0) {
      return NextResponse.json({ error: "BQ not found" }, { status: 404 });
    }

    const currentStatus = subRes.rows[0].status;
    const userRoleIds = (session.user as any)?.roleIds || [];
    const isAdmin = userRoleIds.includes(1);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    if (currentStatus.toLowerCase() !== "submitted") {
      return NextResponse.json(
        { error: `Cannot change status from '${currentStatus}'. Only 'Submitted' BQs can be approved or rejected.` },
        { status: 400 }
      );
    }

    await query(
      `UPDATE tender_submission
       SET status = $1, updated_at = NOW()
       WHERE submission_id = $2`,
      [titleCaseStatus, submissionId]
    );

    return NextResponse.json({ success: true, status: titleCaseStatus });
  } catch (error) {
    console.error("Error updating BQ status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}