// app/api/tenders/documents/[filename]/route.ts
//
// Serves files uploaded via /api/tenders/upload, which are written outside
// /public specifically so they can't be fetched unauthenticated by anyone
// who has the URL (see the comment in that route). This route requires a
// session, matching the same bar the upload route itself already enforces.
//
// Note: there is currently no `tender_document` (or similar) association
// between an uploaded filename and a specific tender/record anywhere in
// the codebase, so this can only enforce "must be logged in" — not
// per-tender authorization ("must be entitled to this specific tender's
// documents"). That's a real, separate gap: building it needs the missing
// upload<->tender association to exist first, not a fix that belongs here.
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
