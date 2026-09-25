import { describe, expect, it } from "vitest";
import { computeScore, matchesCondition, matchRoutingRule, pickLeastBusy, pickRoundRobin } from "./routing";

const baseContext = { source: "instagram", tags: ["vip", "hot"], customFieldValues: { budget: "50000" } };

describe("matchesCondition", () => {
  it("matches source by exact equality", () => {
    expect(matchesCondition({ field: "source", operator: "equals", value: "instagram" }, baseContext)).toBe(true);
    expect(matchesCondition({ field: "source", operator: "equals", value: "whatsapp" }, baseContext)).toBe(false);
  });

  it("matches a tag with contains, case-insensitively", () => {
    expect(matchesCondition({ field: "tag", operator: "contains", value: "VIP" }, baseContext)).toBe(true);
    expect(matchesCondition({ field: "tag", operator: "contains", value: "cold" }, baseContext)).toBe(false);
  });

  it("matches a custom field value by its fieldId", () => {
    expect(matchesCondition({ field: "customField", operator: "equals", value: "50000", fieldId: "budget" }, baseContext)).toBe(true);
    expect(matchesCondition({ field: "customField", operator: "equals", value: "50000", fieldId: "language" }, baseContext)).toBe(false);
  });
});

describe("computeScore", () => {
  it("sums points for every matching rule and skips non-matching ones", () => {
    const rules = [
      { condition: { field: "source" as const, operator: "equals" as const, value: "instagram" }, points: 10 },
      { condition: { field: "tag" as const, operator: "contains" as const, value: "vip" }, points: 20 },
      { condition: { field: "source" as const, operator: "equals" as const, value: "whatsapp" }, points: 100 }
    ];
    expect(computeScore(rules, baseContext)).toBe(30);
  });
});

describe("matchRoutingRule", () => {
  it("returns the first rule whose conditions all match (ANDed)", () => {
    const rules = [
      {
        conditions: [
          { field: "source" as const, operator: "equals" as const, value: "whatsapp" },
          { field: "tag" as const, operator: "contains" as const, value: "vip" }
        ],
        assignTo: { type: "user" as const, targetId: "u-no-match" }
      },
      {
        conditions: [{ field: "tag" as const, operator: "contains" as const, value: "vip" }],
        assignTo: { type: "user" as const, targetId: "u-match" }
      }
    ];
    expect(matchRoutingRule(rules, baseContext)).toEqual({ type: "user", targetId: "u-match" });
  });

  it("returns null when nothing matches", () => {
    const rules = [{ conditions: [{ field: "source" as const, operator: "equals" as const, value: "whatsapp" }], assignTo: { type: "user" as const, targetId: "u1" } }];
    expect(matchRoutingRule(rules, baseContext)).toBeNull();
  });
});

describe("pickLeastBusy", () => {
  it("picks the candidate with the fewest open leads", () => {
    const candidates = [
      { userId: "a", openLeadCount: 5 },
      { userId: "b", openLeadCount: 2 },
      { userId: "c", openLeadCount: 8 }
    ];
    expect(pickLeastBusy(candidates)).toBe("b");
  });

  it("returns null for an empty candidate list", () => {
    expect(pickLeastBusy([])).toBeNull();
  });
});

describe("pickRoundRobin", () => {
  it("cycles deterministically through candidates sorted by userId", () => {
    const candidates = [
      { userId: "b", openLeadCount: 0 },
      { userId: "a", openLeadCount: 0 },
      { userId: "c", openLeadCount: 0 }
    ];
    expect(pickRoundRobin(candidates, 0)).toBe("a");
    expect(pickRoundRobin(candidates, 1)).toBe("b");
    expect(pickRoundRobin(candidates, 3)).toBe("a");
  });

  it("returns null for an empty candidate list", () => {
    expect(pickRoundRobin([], 5)).toBeNull();
  });
});
