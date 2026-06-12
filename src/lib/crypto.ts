import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getMasterKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) throw new Error("MASTER_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.byteLength !== 32) throw new Error("MASTER_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  return buf;
}

// Derive a stable per-user data key from the master key + userId.
// The data key is also stored encrypted in profiles.data_key_enc so it can
// be rotated independently of user IDs.
export function deriveUserKey(userId: string): Buffer {
  return createHmac("sha256", getMasterKey()).update(userId).digest();
}

export function encryptField(plaintext: string, keyBuffer: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv):base64(tag):base64(ciphertext)
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptField(ciphertext: string, keyBuffer: Buffer): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, "base64");
  const tag = Buffer.from(tagB64!, "base64");
  const data = Buffer.from(dataB64!, "base64");
  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

export function generateDataKey(): Buffer {
  return randomBytes(32);
}

export function encryptDataKey(dataKey: Buffer): string {
  return encryptField(dataKey.toString("base64"), getMasterKey());
}

export function decryptDataKey(encryptedDataKey: string): Buffer {
  return Buffer.from(decryptField(encryptedDataKey, getMasterKey()), "base64");
}
