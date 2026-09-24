import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a plaintext token", async () => {
    const { encryptToken, decryptToken } = await import("./encryption");
    const plaintext = "IGQVJYbmFrZAaBOanBlOW1n_super_secret_token";
    const ciphertext = encryptToken(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const { encryptToken } = await import("./encryption");
    const a = encryptToken("same-token");
    const b = encryptToken("same-token");
    expect(a).not.toBe(b);
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const { encryptToken, decryptToken } = await import("./encryption");
    const ciphertext = encryptToken("token-value");
    const tampered = ciphertext.slice(0, -4) + "abcd";
    expect(() => decryptToken(tampered)).toThrow();
  });
});
