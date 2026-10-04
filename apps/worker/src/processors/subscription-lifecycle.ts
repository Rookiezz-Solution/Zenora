import { Prisma, prisma } from "@zenora/db";
import {
  CREDIT_CARRY_DAYS,
  DEFAULT_PLAN_CONFIG,
  TRIAL_DAYS,
  applyPlanOverrides,
  effectivePlanId,
  getPlanConfig,
  lifecycleAction,
  monthStartUtc,
  resetCreditBalance,
  setPlanConfig,
  RENEWAL_REMINDER_DAYS,
  type PlanConfigOverrides,
  type PlanId
} from "@zenora/shared";

const DAY_MS = 86_400_000;
const BATCH = 200;
const RESET_REASONS = ["monthly_reset", "trial_ended", "plan_lapsed"];

// Runs daily. Two jobs, both safe to run again at any time:
//  1. age subscriptions: end expired trials, remind before a paid period ends,
//     mark it past due, and drop a lapsed plan to Free. (Limits already follow
//     the dates through effectivePlanId, so this sweep is about state,
//     notices and credits — not about enforcement waiting on the worker.)
//  2. give every workspace that has used AI its new monthly credits.
export async function processSubscriptionLifecycle(now: Date = new Date()): Promise<{ trialsEnded: number; reminded: number; pastDue: number; lapsed: number; creditsReset: number }> {
  // The worker is a separate process, so it reads the super admin's price/limit
  // overrides itself rather than assuming the shipped defaults.
  const row = await prisma.planConfigOverride.findUnique({ where: { id: "plans" } });
  setPlanConfig(applyPlanOverrides(DEFAULT_PLAN_CONFIG, (row?.data as PlanConfigOverrides | undefined) ?? null));

  const counts = { trialsEnded: 0, reminded: 0, pastDue: 0, lapsed: 0, creditsReset: 0 };

  const due = await prisma.subscription.findMany({
    where: {
      planId: { in: ["starter", "growth", "pro"] },
      OR: [
        { status: "trialing", trialEndsAt: { lte: now } },
        { status: { in: ["active", "past_due"] }, currentPeriodEnd: { lte: new Date(now.getTime() + RENEWAL_REMINDER_DAYS * DAY_MS) } }
      ]
    },
    take: BATCH
  });

  for (const sub of due) {
    try {
      switch (lifecycleAction(sub, now)) {
        case "trial_ended": {
          await moveToFree(sub.workspaceId);
          const trialStart = new Date((sub.trialEndsAt ?? now).getTime() - TRIAL_DAYS * DAY_MS);
          await resetCredits(sub.workspaceId, "free", "trial_ended", trialStart);
          await notify(sub.workspaceId, "trial_ended", "Your free trial has ended", "You are now on the Free plan. Choose a plan under Settings → Billing to keep Growth features.");
          counts.trialsEnded++;
          break;
        }
        case "renewal_reminder":
          if (!(await recentlyNotified(sub.workspaceId, "plan_renewal_due", new Date(now.getTime() - 4 * DAY_MS)))) {
            await notify(sub.workspaceId, "plan_renewal_due", "Your plan renews soon", `Your plan ends on ${sub.currentPeriodEnd?.toDateString()}. Pay again under Settings → Billing to keep it.`);
            counts.reminded++;
          }
          break;
        case "past_due":
          await prisma.subscription.update({ where: { workspaceId: sub.workspaceId }, data: { status: "past_due" } });
          await notify(sub.workspaceId, "plan_past_due", "Your plan has ended", "Everything keeps working for a few more days. Pay under Settings → Billing to avoid dropping to the Free plan.");
          counts.pastDue++;
          break;
        case "lapsed":
          await moveToFree(sub.workspaceId);
          await resetCredits(sub.workspaceId, "free", "plan_lapsed", new Date(now.getTime() - CREDIT_CARRY_DAYS * DAY_MS));
          await notify(sub.workspaceId, "plan_lapsed", "Your workspace is now on the Free plan", "Your paid plan was not renewed. Your data is kept; pay under Settings → Billing to get your plan back.");
          counts.lapsed++;
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`Subscription lifecycle failed for ${sub.workspaceId}:`, err instanceof Error ? err.message : err);
    }
  }

  counts.creditsReset = await resetMonthlyCredits(now);
  return counts;
}

async function moveToFree(workspaceId: string) {
  await prisma.$transaction([
    prisma.subscription.update({ where: { workspaceId }, data: { planId: "free", status: "active", currentPeriodEnd: null } }),
    prisma.workspace.update({ where: { id: workspaceId }, data: { planId: "free" } })
  ]);
}

async function recentlyNotified(workspaceId: string, type: string, since: Date): Promise<boolean> {
  return (await prisma.notification.findFirst({ where: { workspaceId, type, createdAt: { gte: since } }, select: { id: true } })) !== null;
}

async function notify(workspaceId: string, type: string, title: string, body: string) {
  await prisma.notification.create({ data: { workspaceId, type, title, body, channel: "app" } });
}

// Writes a ledger entry (even a zero one, so the month is marked done) taking
// the balance to the plan's allotment plus any bought credits still unspent.
// A workspace that has never used AI has no ledger and is left alone: its first
// spend grants whatever plan it is on then.
async function resetCredits(workspaceId: string, planId: PlanId, reason: string, boughtSince: Date): Promise<boolean> {
  const last = await prisma.creditLedger.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { balanceAfter: true } });
  if (!last) return false;
  const bought = await prisma.creditLedger.aggregate({
    where: { workspaceId, delta: { gt: 0 }, reason: { in: ["topup", "admin_grant"] }, createdAt: { gte: boughtSince } },
    _sum: { delta: true }
  });
  const balanceAfter = resetCreditBalance(last.balanceAfter, getPlanConfig().plans[planId].aiCreditsPerMonth, bought._sum.delta ?? 0);
  await prisma.creditLedger.create({ data: { workspaceId, delta: balanceAfter - last.balanceAfter, reason, balanceAfter } });
  return true;
}

async function resetMonthlyCredits(now: Date): Promise<number> {
  const monthStart = monthStartUtc(now);
  let done = 0;
  const attempted = new Set<string>(); // a workspace that keeps failing must not be picked up forever
  for (let page = 0; page < 25; page++) {
    const rows = await prisma.$queryRaw<{ workspaceId: string }[]>(Prisma.sql`
      SELECT DISTINCT l."workspaceId" FROM "CreditLedger" l
      WHERE NOT EXISTS (
        SELECT 1 FROM "CreditLedger" r
        WHERE r."workspaceId" = l."workspaceId" AND r.reason = ANY(${RESET_REASONS}) AND r."createdAt" >= ${monthStart}
      )
      LIMIT ${BATCH}`);
    const fresh = rows.filter((r) => !attempted.has(r.workspaceId));
    if (fresh.length === 0) break;
    for (const { workspaceId } of fresh) {
      attempted.add(workspaceId);
      try {
        const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
        if (await resetCredits(workspaceId, effectivePlanId(sub, now), "monthly_reset", new Date(now.getTime() - CREDIT_CARRY_DAYS * DAY_MS))) done++;
      } catch (err) {
        console.error(`Monthly credit reset failed for ${workspaceId}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return done;
}
