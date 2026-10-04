import { decryptWithKey, encryptWithKey } from "../common/encryption";

export interface StoredSecret {
  id: string;
  value: string;
}

export interface RotationPlan {
  // New ciphertext for every value that was under the old key.
  updates: { id: string; value: string }[];
  // Values that already open with the new key (a previous run, or a partly rotated database).
  alreadyRotated: number;
  // Values that open with neither key: rotating would lose them, so the run must stop.
  failures: string[];
}

// Works out what rotating would do, without touching anything.
export function planRotation(rows: StoredSecret[], oldKey: Buffer, newKey: Buffer): RotationPlan {
  const plan: RotationPlan = { updates: [], alreadyRotated: 0, failures: [] };
  for (const row of rows) {
    try {
      plan.updates.push({ id: row.id, value: encryptWithKey(decryptWithKey(row.value, oldKey), newKey) });
      continue;
    } catch {
      // not under the old key
    }
    try {
      decryptWithKey(row.value, newKey);
      plan.alreadyRotated++;
    } catch {
      plan.failures.push(row.id);
    }
  }
  return plan;
}

export function parseKey(name: string, value: string | undefined): Buffer {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${name} must be 64 hex characters (openssl rand -hex 32)`);
  return Buffer.from(value, "hex");
}
