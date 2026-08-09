import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { decryptLocal } from "@/lib/encryption";
import { logEvent, extractAuditContext } from "@/lib/audit";
import crypto from "crypto";

function maskVendorName(originalName: string): string {
  const hash = crypto.createHash("sha256").update(originalName).digest("hex").slice(0, 6);
  return `Vendor_${hash}`;
}

async function isTechnicalEvaluator(userId: number): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM user_roles ur
     JOIN roles r ON ur.role_id = r.role_id
     WHERE ur.user_id = $1 AND r.role_name IN ('Technical Evaluator', 'Project Manager', 'Executive Director')`,
    [userId]
  );
  return res.rows.length > 0;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenderId = parseInt(id);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  // Fetch tender details
  const tenderRes = await query(
    `SELECT technical_opening_time, technical_bid_encrypted, vendor_name, status
     FROM tender WHERE tender_id = $1`,
    [tenderId]
  );
  if (tenderRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }
  const tender = tenderRes.rows[0];

  // Time check
  const now = new Date();
  const techOpen = new Date(tender.technical_opening_time);
  if (now < techOpen) {
    // Log unauthorized attempt
    const ctx = extractAuditContext(req);
    await logEvent({
      tableName: "tender",
      recordId: tenderId,
      action: "unauthorized_technical_bid_access",
      userId: session.user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      details: { reason: "before_opening_time" },
    });
    return NextResponse.json({ error: "Technical bid not yet available" }, { status: 403 });
  }

  // Role check
  const isEligible = await isTechnicalEvaluator(session.user.id);
  if (!isEligible) {
    const ctx = extractAuditContext(req);
    await logEvent({
      tableName: "tender",
      recordId: tenderId,
      action: "unauthorized_technical_bid_access",
      userId: session.user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      details: { reason: "insufficient_role" },
    });
    return NextResponse.json({ error: "Forbidden – you are not a technical evaluator" }, { status: 403 });
  }

  // Decrypt
  let decrypted: string;
  try {
    decrypted = await decryptLocal(tender.technical_bid_encrypted);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Decryption failed" }, { status: 500 });
  }

  // Mask vendor name if still in technical evaluation phase
  let vendorDisplay = tender.vendor_name;
  if (tender.status === "technical_evaluation") {
    vendorDisplay = maskVendorName(tender.vendor_name);
  }

  // Log successful access
  {
    const ctx = extractAuditContext(req);
    await logEvent({
      tableName: "tender",
      recordId: tenderId,
      action: "view_technical_bid",
      userId: session.user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      details: { vendor_masked: vendorDisplay !== tender.vendor_name },
    });
  }

  return NextResponse.json({
    tenderId,
    vendor: vendorDisplay,
    technicalBid: JSON.parse(decrypted), // assume JSON stored
  });
}