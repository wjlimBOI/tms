// app/api/tenders/[id]/documents/route.ts
// Lists (and, for Admin, removes) documents attached to a specific tender —
// the UI-facing counterpart to /api/tenders/upload and
// /api/tenders/documents/[filename], which write/serve the underlying file.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasRole, canAccessTenderDocuments } from "@/lib/permissions";
import { ROLE_IDS } from "@/lib/roles";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "Invalid tender ID" }, { status: 400 });
  }

  const userId = (session.user as any).id;
  const roleIds = (session.user as any).roleIds || [];
  const allowed = await canAccessTenderDocuments(tenderId, userId, roleIds);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await query(
    `SELECT td.document_id, td.file_name, td.file_path, td.file_type, td.file_size,
            td.description, td.created_at, COALESCE(up.full_name, u.username) AS uploaded_by_name
     FROM tender_document td
     JOIN users u ON u.user_id = td.uploaded_by
     LEFT JOIN user_profile up ON up.user_id = u.user_id
     WHERE td.tender_id = $1 AND td.is_active = true
     ORDER BY td.created_at DESC`,
    [tenderId]
  );

  return NextResponse.json({
    documents: result.rows.map((d) => ({ ...d, file_size: Number(d.file_size), url: `/api/tenders/documents/${d.file_path}` })),
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const roleIds = (session?.user as any)?.roleIds || [];
  if (!session?.user || !hasRole(roleIds, ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  const body = await req.json().catch(() => ({}));
  const documentId = parseInt(body.document_id, 10);
  if (isNaN(tenderId) || isNaN(documentId)) {
    return NextResponse.json({ error: "Invalid tender or document ID" }, { status: 400 });
  }

  const result = await query(
    `UPDATE tender_document SET is_active = false, updated_at = NOW()
     WHERE document_id = $1 AND tender_id = $2
     RETURNING document_id`,
    [documentId, tenderId]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
