// Magic-byte signature checks for uploaded file content, independent of
// client-supplied filename/MIME type (both are trivially spoofable).

export function isValidXlsxSignature(buffer: Buffer): boolean {
  // .xlsx is a zip (OOXML) container - a PK zip signature is the strongest
  // check available without fully parsing the archive. Matches the same
  // check already used for .xlsx/.docx uploads in
  // src/app/api/tenders/upload/route.ts.
  if (buffer.length < 4) return false;
  const sig = [buffer[0], buffer[1], buffer[2], buffer[3]].join(",");
  return sig === "80,75,3,4" || sig === "80,75,5,6";
}
