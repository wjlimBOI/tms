import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenderId = parseInt(id);
    const contractorId = session.user.id;

    // 1. Verify contractor role (role_id = 13)
    const roleCheck = await query(
      `SELECT role_id FROM users WHERE user_id = $1`,
      [contractorId]
    );
    if (roleCheck.rows.length === 0 || roleCheck.rows[0].role_id !== 13) {
      return NextResponse.json({ error: "Only contractors can submit tenders" }, { status: 403 });
    }

    // 2. Get request body
    const body = await req.json();
    const {
      agreedName,
      agreedDate,
      stampPreview,
      lumpSumRaw,
      lumpSumFormatted,   // sent from frontend
      amountInWords,
      mainTenderer,
      witness,
      declaration,
      declarationStampPreview,
      projectExperience,
      currentCommitment,
    } = body;

    // 3. Validate required fields
    if (!agreedName || !agreedDate || !lumpSumRaw || !mainTenderer?.signature || !declaration?.signature) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 4. Check tender exists and is open
    const tenderCheck = await query(
      `SELECT status_label, closing_date FROM tender WHERE tender_id = $1`,
      [tenderId]
    );
    if (tenderCheck.rows.length === 0) {
      return NextResponse.json({ error: "Tender not found" }, { status: 404 });
    }
    const tender = tenderCheck.rows[0];
    if (tender.status_label !== "Open") {
      return NextResponse.json({ error: "Tender is no longer open for submissions" }, { status: 400 });
    }
    if (new Date() > new Date(tender.closing_date)) {
      return NextResponse.json({ error: "Submission deadline has passed" }, { status: 400 });
    }

    // 5. Prepare JSON data for storage
    const formData = JSON.stringify({
      agreedName,
      agreedDate,
      stampPreview,
      lumpSumRaw,
      lumpSumFormatted,
      amountInWords,
      mainTenderer,
      witness,
      declaration,
      declarationStampPreview,
      projectExperience,
      currentCommitment,
    });

    // 6. Find existing submission for this contractor & tender (Draft only)
    const existing = await query(
      `SELECT submission_id FROM tender_submission 
       WHERE tender_id = $1 AND contractor_id = $2 AND is_deleted = false
       ORDER BY created_at DESC LIMIT 1`,
      [tenderId, contractorId]
    );

    let submissionId;
    if (existing.rows.length > 0) {
      // Update existing draft to "Submitted"
      const updateRes = await query(
        `UPDATE tender_submission 
         SET status = $1, submitted_at = NOW(), updated_at = NOW(), 
             bq_name = $2, remarks = $3
         WHERE submission_id = $4
         RETURNING submission_id`,
        ["Submitted", `Submission for Tender ${tenderId}`, formData, existing.rows[0].submission_id]
      );
      submissionId = updateRes.rows[0].submission_id;
    } else {
      // Create new submission (round 1)
      const insertRes = await query(
        `INSERT INTO tender_submission 
         (tender_id, contractor_id, round_no, status, submitted_at, created_at, updated_at, bq_name, remarks)
         VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW(), $5, $6)
         RETURNING submission_id`,
        [tenderId, contractorId, 1, "Submitted", `Submission for Tender ${tenderId}`, formData]
      );
      submissionId = insertRes.rows[0].submission_id;
    }

    // 7. Insert acknowledgment (required for BQ template page)
    await query(
      `INSERT INTO tender_acknowledgment (tender_id, contractor_id, signature, sections, checklist_data, acknowledged_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (tender_id, contractor_id) DO UPDATE SET
         signature = EXCLUDED.signature,
         acknowledged_at = NOW()`,
      [tenderId, contractorId, declaration.signature || agreedName, JSON.stringify({}), JSON.stringify({})]
    );

    return NextResponse.json({ success: true, submissionId }, { status: 200 });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}