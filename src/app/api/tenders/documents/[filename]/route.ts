// app/api/tenders/documents/[filename]/route.ts
//
// Serves files uploaded via /api/tenders/upload, which are written outside
// /public specifically so they can't be fetched unauthenticated by anyone
// who has the URL (see the comment in that route).
//
// Real per-tender authorization: /api/tenders/upload now requires a
// tender_id and writes a tender_document row per upload, so this route
// looks the filename up there and checks the requester is actually
// entitled to that specific tender's documents (canAccessTenderDocuments) —
// not just "must be logged in," which is all it could enforce before that
// linkage existed.
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { canAccessTenderDocuments } from "@/lib/permissions";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Must exactly match the uuidv4() + extension filenames the upload route
// generates — rejects anything else outright, which is what actually
// prevents path traversal here (no ../ or arbitrary path can match this).
const FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.pdf|\.docx|\.xlsx|\.jpg|\.jpeg|\.png|\.webp)$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const docRes = await query(
    `SELECT tender_id, is_active FROM tender_document WHERE file_path = $1`,
    [filename]
  );
  if (docRes.rows.length === 0 || !docRes.rows[0].is_active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { tender_id: tenderId } = docRes.rows[0];

  const userId = (session.user as any).id;
  const roleIds = (session.user as any).roleIds || [];
  const allowed = await canAccessTenderDocuments(tenderId, userId, roleIds);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ext = path.extname(filename).toLowerCase();
  const filepath = path.join(process.cwd(), "private/uploads/tenders", filename);

  let buffer: Buffer;
  try {
    buffer = await readFile(filepath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Blob([new Uint8Array(buffer)]), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
