import { prisma } from "@zenora/db";
import { decryptWithKey } from "../common/encryption";
import { parseKey, planRotation, type RotationPlan } from "./rotate-key-plan";

// Re-encrypts everything stored under TOKEN_ENCRYPTION_KEY with a new key:
//
//   OLD_TOKEN_ENCRYPTION_KEY=<current key> NEW_TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32) \
//     pnpm rotate-key            # dry run: reports what it would do, changes nothing
//   ... pnpm rotate-key --apply  # does it
//
// All the changes happen in one transaction, so it is all or nothing, and it
// stops without changing anything if a single value opens with neither key.
// Afterwards, set TOKEN_ENCRYPTION_KEY to the new key everywhere (API and
// worker) and restart. Keep the old key until you have checked the app.
interface Target {
  label: string;
  delegate: string;
  idField: string;
  field: string;
}

const TARGETS: Target[] = [
  { label: "Instagram accounts", delegate: "instagramAccount", idField: "id", field: "accessTokenCipher" },
  { label: "WhatsApp numbers", delegate: "whatsappNumber", idField: "id", field: "accessTokenCipher" },
  { label: "Ad accounts", delegate: "adAccount", idField: "id", field: "accessTokenCipher" },
  { label: "Google Calendar connections", delegate: "calendarAccount", idField: "id", field: "refreshTokenCipher" },
  { label: "Integration credentials", delegate: "platformSetting", idField: "key", field: "valueCipher" },
  { label: "Webhook signing secrets", delegate: "webhookEndpoint", idField: "id", field: "secretCipher" }
];

interface Delegate {
  findMany(args: { select: Record<string, true> }): Promise<Record<string, string | null>[]>;
  update(args: { where: Record<string, string>; data: Record<string, string> }): Promise<unknown>;
}
const table = (t: Target) => (prisma as unknown as Record<string, Delegate>)[t.delegate]!;

async function main() {
  const oldKey = parseKey("OLD_TOKEN_ENCRYPTION_KEY", process.env.OLD_TOKEN_ENCRYPTION_KEY);
  const newKey = parseKey("NEW_TOKEN_ENCRYPTION_KEY", process.env.NEW_TOKEN_ENCRYPTION_KEY);
  if (oldKey.equals(newKey)) throw new Error("The old and new keys are the same");
  const apply = process.argv.includes("--apply");

  const plans: { target: Target; plan: RotationPlan }[] = [];
  for (const target of TARGETS) {
    const rows = await table(target).findMany({ select: { [target.idField]: true, [target.field]: true } });
    const secrets = rows.filter((r) => r[target.field]).map((r) => ({ id: r[target.idField] as string, value: r[target.field] as string }));
    plans.push({ target, plan: planRotation(secrets, oldKey, newKey) });
  }

  let failures = 0;
  for (const { target, plan } of plans) {
    console.log(`${target.label}: ${plan.updates.length} to re-encrypt, ${plan.alreadyRotated} already on the new key, ${plan.failures.length} unreadable`);
    for (const id of plan.failures) console.log(`  UNREADABLE with either key: ${target.delegate} ${id}`);
    failures += plan.failures.length;
  }
  if (failures > 0) throw new Error("Stopping: some values open with neither key. Nothing was changed. Is OLD_TOKEN_ENCRYPTION_KEY the key currently in use?");

  if (!apply) {
    console.log("\nDry run: nothing was changed. Run again with --apply to rotate.");
    return;
  }

  await prisma.$transaction(
    plans.flatMap(({ target, plan }) => plan.updates.map((u) => table(target).update({ where: { [target.idField]: u.id }, data: { [target.field]: u.value } }))) as never,
    { timeout: 120_000 }
  );

  // Read everything back and open it with the new key before declaring success.
  let verified = 0;
  for (const target of TARGETS) {
    const rows = await table(target).findMany({ select: { [target.idField]: true, [target.field]: true } });
    for (const row of rows) {
      const value = row[target.field];
      if (!value) continue;
      decryptWithKey(value, newKey);
      verified++;
    }
  }
  console.log(`\nRotated. ${verified} values read back and opened with the new key.`);
  console.log("Next: set TOKEN_ENCRYPTION_KEY to the new key for the API and the worker, restart both, and keep the old key until you have checked the app.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
