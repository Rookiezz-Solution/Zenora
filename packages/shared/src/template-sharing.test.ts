import { describe, expect, it } from "vitest";
import { findPersonalData, templateOrigin } from "./template-sharing";

const graph = (...bodies: string[]) => ({
  startBlockId: "a",
  blocks: Object.fromEntries(bodies.map((body, i) => [`block${i}`, { id: `block${i}`, type: "send_text", body, next: null }]))
});

describe("findPersonalData", () => {
  it("accepts ordinary template text, including placeholders and short numbers", () => {
    expect(findPersonalData(graph("Hi {first_name}, thanks for contacting {business_name}!", "Slots from 10:30 to 18:00, 3 sessions of 45 minutes."))).toEqual([]);
  });

  it("finds email addresses, and masks them in the report", () => {
    const issues = findPersonalData(graph("Mail me at asha.rao@example.com for details"));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("email");
    expect(issues[0]!.sample).not.toContain("asha.rao");
  });

  it("finds phone numbers in the usual Indian and international spellings", () => {
    for (const text of ["Call 9876543210 now", "Call +91 98765 43210", "WhatsApp 98765-43210", "Call (022) 2345 6789", "+1 415 555 0132"]) {
      expect(findPersonalData(graph(text)).map((i) => i.kind), text).toEqual(["phone"]);
    }
  });

  it("looks inside quick-reply options and nested values, but not at block ids or wiring", () => {
    const g = { startBlockId: "a", blocks: { "9876543210": { id: "x", type: "send_quick_replies", body: "Pick", options: [{ label: "Call 9123456780", next: null }] } } };
    const issues = findPersonalData(g);
    expect(issues).toHaveLength(1); // the label, not the numeric block key
    expect(issues[0]!.kind).toBe("phone");
  });

  it("does not report an email's digits as a phone number", () => {
    expect(findPersonalData(graph("write to user12345678@example.com")).map((i) => i.kind)).toEqual(["email"]);
  });
});

describe("templateOrigin", () => {
  it("labels templates without revealing who made a community one", () => {
    expect(templateOrigin({ workspaceId: "w1", scope: "private" }, "w1")).toBe("mine");
    expect(templateOrigin({ workspaceId: null, scope: "public" }, "w1")).toBe("zenora");
    expect(templateOrigin({ workspaceId: "w2", scope: "agency" }, "w1")).toBe("agency");
    expect(templateOrigin({ workspaceId: "w2", scope: "public" }, "w1")).toBe("community");
  });
});
