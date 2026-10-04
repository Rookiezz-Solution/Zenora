import { describe, expect, it } from "vitest";
import { decryptWithKey, encryptWithKey } from "../common/encryption";
import { parseKey, planRotation } from "./rotate-key-plan";

const oldKey = Buffer.alloc(32, 1);
const newKey = Buffer.alloc(32, 2);
const otherKey = Buffer.alloc(32, 3);

describe("planRotation", () => {
  it("re-encrypts values from the old key to the new one, keeping the secret intact", () => {
    const plan = planRotation([{ id: "a", value: encryptWithKey("token-a", oldKey) }, { id: "b", value: encryptWithKey("token-b", oldKey) }], oldKey, newKey);
    expect(plan.failures).toEqual([]);
    expect(plan.updates.map((u) => decryptWithKey(u.value, newKey))).toEqual(["token-a", "token-b"]);
    expect(() => decryptWithKey(plan.updates[0]!.value, oldKey)).toThrow(); // really moved to the new key
  });

  it("leaves values already on the new key alone, so a second run is harmless", () => {
    const plan = planRotation([{ id: "a", value: encryptWithKey("x", newKey) }], oldKey, newKey);
    expect(plan).toEqual({ updates: [], alreadyRotated: 1, failures: [] });
  });

  it("reports a value that opens with neither key instead of guessing", () => {
    const plan = planRotation([{ id: "ok", value: encryptWithKey("x", oldKey) }, { id: "lost", value: encryptWithKey("y", otherKey) }, { id: "junk", value: "not base64 ciphertext" }], oldKey, newKey);
    expect(plan.failures).toEqual(["lost", "junk"]);
    expect(plan.updates.map((u) => u.id)).toEqual(["ok"]);
  });

  it("handles an empty set", () => {
    expect(planRotation([], oldKey, newKey)).toEqual({ updates: [], alreadyRotated: 0, failures: [] });
  });
});

describe("parseKey", () => {
  it("accepts 64 hex characters only", () => {
    expect(parseKey("K", "a1".repeat(32))).toHaveLength(32);
    expect(() => parseKey("K", "short")).toThrow(/64 hex/);
    expect(() => parseKey("K", undefined)).toThrow(/64 hex/);
    expect(() => parseKey("K", "zz".repeat(32))).toThrow(/64 hex/);
  });
});
