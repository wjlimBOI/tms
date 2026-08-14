import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSuperUser } from "@/lib/roles";
import { matchesFileSignature } from "@/lib/fileValidation";
import { query } from "@/lib/db";
import { sanitize } from "@/lib/sanitize";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_TYPES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // No `tender_document`-style association between an uploaded file and a
  // specific tender exists yet (see the paired GET route's comment), so
  // per-tender entitlement can't be enforced here. Restricting to Admin
  // closes the immediate gap - previously ANY authenticated user, including
  // Contractor, could write arbitrary allowed-type files to shared disk.
  const roleIds = (session.user as any).roleIds || [];
  if (!isSuperUser(roleIds)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Required so this upload can actually be tied back to a tender - this is
  // the missing link tenders/documents/[filename]'s auth check depends on
  // (see that route's own header comment). Without it there is no way to
  // ever authorize a specific contractor against a specific file, only
  // "is logged in."
  const tenderId = parseInt(String(formData.get("tender_id") || ""), 10);
  if (isNaN(tenderId)) {
    return NextResponse.json({ error: "tender_id is required" }, { status: 400 });
  }
  const tenderRes = await query(
    `SELECT tender_id FROM tender WHERE tender_id = $1 AND is_deleted = false`,
    [tenderId]
  );
  if (tenderRes.rows.length === 0) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }
  const description = sanitize(String(formData.get("description") || "")).slice(0, 500) || null;

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const ext = path.extname(file.name).toLowerCase();
  const allowedMimeTypes = ALLOWED_TYPES[ext];
  if (!allowedMimeTypes || !allowedMimeTypes.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (!matchesFileSignature(ext, buffer)) {
    return NextResponse.json({ error: "File content does not match its extension" }, { status: 415 });
  }

  // Written outside /public — Next.js serves that directory statically with
  // no authorization at all, so anything placed there (tender drawings,
  // contract documents) would be downloadable by anyone with the URL,
  // logged in or not, forever. Served back out only through the
  // authenticated GET route below instead.
  const uploadDir = path.join(process.cwd(), "private/uploads/tenders");
  await mkdir(uploadDir, { recursive: true });
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  const docRes = await query(
    `INSERT INTO tender_document (tender_id, uploaded_by, file_name, file_path, file_type, file_size, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING document_id`,
    [tenderId, (session.user as any).id, sanitize(file.name).slice(0, 255), filename, file.type, file.size, description]
  );

  const url = `/api/tenders/documents/${filename}`;
  return NextResponse.json({ url, document_id: docRes.rows[0].document_id });
}