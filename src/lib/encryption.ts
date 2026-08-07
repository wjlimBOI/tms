import crypto from "crypto";

// In production, store this key in environment variables and use a KMS.
const ALGORITHM = "aes-256-gcm";

// No random fallback: a key generated at process start would make anything
// encrypted with it permanently undecryptable after a restart (and would
// differ across instances). Fail loudly instead so misconfiguration is
// caught immediately rather than silently corrupting data.
function getEncryptionKey(): Buffer {
  const key = process.env.LOCAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("LOCAL_ENCRYPTION_KEY is not configured");
  }
  return Buffer.from(key, "hex");
}

export async function encryptLocal(text: string): Promise<string> {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export async function decryptLocal(encryptedData: string): Promise<string> {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}