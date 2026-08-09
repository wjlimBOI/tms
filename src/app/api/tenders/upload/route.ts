import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import { ROLE_IDS } from "@/lib/roles";
import { matchesFileSignature } from "@/lib/fileValidation";

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
  if (!hasRole(roleIds, ROLE_IDS.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

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
  const url = `/api/tenders/documents/${filename}`;
  return NextResponse.json({ url });
}