import * as crypto from "node:crypto";

// Mirrors apps/api/src/common/encryption.ts's decryptToken — duplicated
// rather than shared because it's the one piece of api-specific code the
// engine needs (to send messages with the workspace's stored channel
// tokens) and pulling in Nest's DI-based encryption module here isn't worth
// the coupling for ~15 lines. Keep both in sync if the cipher ever changes.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return Buffer.from(key, "hex");
}

export function decryptToken(ciphertext: string): string {
  const raw = Buffer.from(ciphertext, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
