import { describe, expect, it } from "vitest";
import { conditionsPass, matchesCrmEvent } from "./trigger-events";

const ctx = { source: "whatsapp", tags: ["vip"], customFieldValues: {} };
const cond = (value: string, field: "source" | "tag" = "source") => ({ field, operator: "equals" as const, value });

describe("matchesCrmEvent", () => {
  it("tag_added: a named tag must match, an empty name means any tag", () => {
    expect(matchesCrmEvent("tag_added", { tagName: "vip" }, { tagName: "vip" })).toBe(true);
    expect(matchesCrmEvent("tag_added", { tagName: "vip" }, { tagName: "cold" })).toBe(false);
    expect(matchesCrmEvent("tag_added", { tagName: null }, { tagName: "anything" })).toBe(true);
  });

  it("stage_changed: a chosen stage must match, null means any stage", () => {
    expect(matchesCrmEvent("stage_changed", { stageId: "s2" }, { stageId: "s2" })).toBe(true);
    expect(matchesCrmEvent("stage_changed", { stageId: "s2" }, { stageId: "s3" })).toBe(false);
    expect(matchesCrmEvent("stage_changed", { stageId: null }, { stageId: "s3" })).toBe(true);
  });

  it("score_reached: fires only at the moment the score crosses up to the threshold", () => {
    const cfg = { threshold: 50 };
    expect(matchesCrmEvent("score_reached", cfg, { scoreBefore: 40, scoreAfter: 50 })).toBe(true);
    expect(matchesCrmEvent("score_reached", cfg, { scoreBefore: 10, scoreAfter: 90 })).toBe(true);
    expect(matchesCrmEvent("score_reached", cfg, { scoreBefore: 50, scoreAfter: 70 })).toBe(false); // already above
    expect(matchesCrmEvent("score_reached", cfg, { scoreBefore: 20, scoreAfter: 49 })).toBe(false); // not there yet
    expect(matchesCrmEvent("score_reached", cfg, { scoreBefore: 60, scoreAfter: 30 })).toBe(false); // going down
    expect(matchesCrmEvent("score_reached", cfg, { scoreBefore: 0, scoreAfter: 50 })).toBe(true); // brand-new lead
  });

  it("never matches a malformed config or an event without the needed facts", () => {
    expect(matchesCrmEvent("score_reached", { threshold: "50" }, { scoreBefore: 0, scoreAfter: 99 })).toBe(false);
    expect(matchesCrmEvent("score_reached", { threshold: 50 }, { scoreAfter: 99 })).toBe(false);
    expect(matchesCrmEvent("tag_added", undefined, { tagName: "x" })).toBe(false);
  });
});

describe("conditionsPass", () => {
  it("no conditions means no restriction", () => {
    expect(conditionsPass(undefined, "all", ctx)).toBe(true);
    expect(conditionsPass([], "any", ctx)).toBe(true);
  });
  it("all (the default): every condition must hold", () => {
    expect(conditionsPass([cond("whatsapp"), cond("vip", "tag")], "all", ctx)).toBe(true);
    expect(conditionsPass([cond("whatsapp"), cond("cold", "tag")], undefined, ctx)).toBe(false);
  });
  it("any: one is enough", () => {
    expect(conditionsPass([cond("instagram"), cond("vip", "tag")], "any", ctx)).toBe(true);
    expect(conditionsPass([cond("instagram"), cond("cold", "tag")], "any", ctx)).toBe(false);
  });
});
