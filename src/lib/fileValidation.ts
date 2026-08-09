// Magic-byte signature checks for uploaded file content, independent of
// client-supplied filename/MIME type (both are trivially spoofable). This
// is the single source of truth for these checks — previously
// src/app/api/tenders/upload/route.ts reimplemented the zip-signature
// check inline instead of importing isValidXlsxSignature from here.

function bytesAt(buffer: Buffer, ...offsets: number[]): string {
  return offsets.map((o) => buffer[o]).join(",");
}

// .xlsx/.docx are both zip (OOXML) containers - a PK zip signature is the
// strongest check available without fully parsing the archive.
export function isValidZipSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const sig = bytesAt(buffer, 0, 1, 2, 3);
  return sig === "80,75,3,4" || sig === "80,75,5,6";
}

// Kept as an alias for the existing .xlsx-specific call sites (bq/upload-new,
// bq/import, admin/bq-template/upload) — same check, xlsx-specific name.
export const isValidXlsxSignature = isValidZipSignature;

export function isValidPdfSignature(buffer: Buffer): boolean {
  return buffer.toString("ascii", 0, 4) === "%PDF";
}

export function isValidJpegSignature(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  return bytesAt(buffer, 0, 1, 2) === "255,216,255";
}

export function isValidPngSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return bytesAt(buffer, 0, 1, 2, 3) === "137,80,78,71";
}

export function isValidWebpSignature(buffer: Buffer): boolean {
  return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

// Dispatch by lowercased file extension (e.g. ".pdf") - used by
// src/app/api/tenders/upload/route.ts, which accepts multiple file types.
export function matchesFileSignature(ext: string, buffer: Buffer): boolean {
  switch (ext) {
    case ".pdf":
      return isValidPdfSignature(buffer);
    case ".docx":
    case ".xlsx":
      return isValidZipSignature(buffer);
    case ".jpg":
    case ".jpeg":
      return isValidJpegSignature(buffer);
    case ".png":
      return isValidPngSignature(buffer);
    case ".webp":
      return isValidWebpSignature(buffer);
    default:
      return false;
  }
}
