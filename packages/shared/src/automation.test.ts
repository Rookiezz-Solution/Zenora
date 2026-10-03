import { describe, expect, it } from "vitest";
import { isTriggerAllowedToFire, triggerDelayMs } from "./automation";

describe("isTriggerAllowedToFire", () => {
  it("allows firing when there's no prior run for this lead", () => {
    expect(isTriggerAllowedToFire("auto1", undefined, [])).toBe(true);
  });

  it("blocks firing while a run is already in progress, by default", () => {
    const runs = [{ automationId: "auto1", status: "running" }];
    expect(isTriggerAllowedToFire("auto1", undefined, runs)).toBe(false);
  });

  it("allows re-firing once the previous run has completed, by default", () => {
    const runs = [{ automationId: "auto1", status: "completed" }];
    expect(isTriggerAllowedToFire("auto1", undefined, runs)).toBe(true);
  });

  it("blocks any re-fire when onceForLead is set, even after completion", () => {
    const runs = [{ automationId: "auto1", status: "completed" }];
    expect(isTriggerAllowedToFire("auto1", { onceForLead: true }, runs)).toBe(false);
  });

  it("only looks at runs for the given automation id", () => {
    const runs = [{ automationId: "other", status: "running" }];
    expect(isTriggerAllowedToFire("auto1", undefined, runs)).toBe(true);
  });
});

describe("triggerDelayMs", () => {
  it("returns 0 when no limits or delay is set", () => {
    expect(triggerDelayMs(undefined)).toBe(0);
    expect(triggerDelayMs({})).toBe(0);
  });

  it("converts delayMinutes to milliseconds", () => {
    expect(triggerDelayMs({ delayMinutes: 5 })).toBe(300_000);
  });
});
