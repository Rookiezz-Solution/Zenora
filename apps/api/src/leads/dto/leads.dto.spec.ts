import { describe, expect, it } from "vitest";
import { createLeadSchema, importLeadsSchema } from "./leads.dto";

describe("createLeadSchema", () => {
  it("treats blank strings as not provided instead of failing email validation", () => {
    const result = createLeadSchema.safeParse({ name: "", phone: "919999999999", email: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBeUndefined();
      expect(result.data.email).toBeUndefined();
      expect(result.data.phone).toBe("919999999999");
    }
  });

  it("still rejects a genuinely malformed email", () => {
    const result = createLeadSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("importLeadsSchema", () => {
  it("accepts CSV rows with blank cells for optional fields", () => {
    const result = importLeadsSchema.safeParse({
      rows: [{ name: "Rahul", phone: "917777777777", email: "" }]
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows[0]?.email).toBeUndefined();
    }
  });
});
