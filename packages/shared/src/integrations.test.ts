import { describe, expect, it } from "vitest";
import { INTEGRATION_GROUPS, INTEGRATION_KEYS, findIntegrationField, groupStatus } from "./integrations";

const group = (id: string) => INTEGRATION_GROUPS.find((g) => g.id === id)!;

describe("integration catalog", () => {
  it("never exposes the platform's own secrets for editing", () => {
    for (const forbidden of ["DATABASE_URL", "AUTH_SECRET", "TOKEN_ENCRYPTION_KEY", "REDIS_URL", "SUPER_ADMIN_EMAILS"]) {
      expect(INTEGRATION_KEYS).not.toContain(forbidden);
    }
  });

  it("has unique keys, and every required key is a field of its group", () => {
    expect(new Set(INTEGRATION_KEYS).size).toBe(INTEGRATION_KEYS.length);
    for (const g of INTEGRATION_GROUPS) for (const k of g.required) expect(g.fields.map((f) => f.key)).toContain(k);
  });

  it("marks every credential-like field as secret and never marks a secret public", () => {
    for (const key of ["GOOGLE_CLIENT_SECRET", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "ANTHROPIC_API_KEY", "OTP_PROVIDER_API_KEY"]) {
      expect(findIntegrationField(key)?.secret).toBe(true);
    }
    for (const f of INTEGRATION_GROUPS.flatMap((g) => g.fields)) expect(f.secret && f.public).toBeFalsy();
  });
});

describe("groupStatus", () => {
  it("is configured only when every required key is set", () => {
    expect(groupStatus(group("razorpay"), () => true)).toBe("configured");
  });
  it("is partial when some but not all required keys are set", () => {
    expect(groupStatus(group("razorpay"), (k) => k === "RAZORPAY_KEY_ID")).toBe("partial");
  });
  it("is missing when nothing is set", () => {
    expect(groupStatus(group("anthropic"), () => false)).toBe("missing");
  });
  it("optional extras alone don't count as progress", () => {
    expect(groupStatus(group("anthropic"), (k) => k === "AI_MODEL_VOLUME")).toBe("missing");
  });
  it("reports paused groups as coming soon regardless", () => {
    expect(groupStatus(group("telephony"), () => true)).toBe("coming_soon");
  });
});
