import * as crypto from "node:crypto";
import { loadEnv } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  return Buffer.from(loadEnv().TOKEN_ENCRYPTION_KEY, "hex");
}

// The same cipher with an explicit key, so a stored value can be moved from one
// key to another (scripts/rotate-encryption-key).
export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptWithKey(ciphertext: string, key: Buffer): string {
  const raw = Buffer.from(ciphertext, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// CLAUDE.md rule #8: channel access tokens are never stored in plaintext.
// Ciphertext layout: base64(iv [12B] + authTag [16B] + encrypted).
export function encryptToken(plaintext: string): string {
  return encryptWithKey(plaintext, getKey());
}

export function decryptToken(ciphertext: string): string {
  return decryptWithKey(ciphertext, getKey());
}
