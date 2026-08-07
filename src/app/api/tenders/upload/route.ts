import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

// Verify actual file content against its claimed extension via magic bytes,
// since the extension/MIME allowlist above only trusts client-supplied
// metadata that can be spoofed.
function matchesFileSignature(ext: string, buffer: Buffer): boolean {
  const bytes = (...offsets: number[]) => offsets.map((o) => buffer[o]);
  switch (ext) {
    case ".pdf":
      return buffer.toString("ascii", 0, 4) === "%PDF";
    case ".docx":
    case ".xlsx":
      // Both are zip containers (OOXML) - a PK zip signature is the best
      // check available without fully parsing the archive.
      return bytes(0, 1, 2, 3).join(",") === "80,75,3,4" || bytes(0, 1, 2, 3).join(",") === "80,75,5,6";
    case ".jpg":
    case ".jpeg":
      return bytes(0, 1, 2).join(",") === "255,216,255";
    case ".png":
      return bytes(0, 1, 2, 3).join(",") === "137,80,78,71";
    case ".webp":
      return (
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
      );
    default:
      return false;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const uploadDir = path.join(process.cwd(), "public/uploads/tenders");
  await mkdir(uploadDir, { recursive: true });
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);
  const url = `/uploads/tenders/${filename}`;
  return NextResponse.json({ url });
}