import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import {
  DEFAULT_PLAN_CONFIG,
  EDITABLE_PLAN_FIELDS,
  EDITABLE_PLAN_IDS,
  applyPlanOverrides,
  describePlanChanges,
  diffPlanConfig,
  getPlanConfig,
  isLargePriceChange,
  isLimitDecrease,
  setPlanConfig,
  validatePlanConfig,
  validatePlanOverrides,
  type PlanChange,
  type PlanConfigOverrides,
  type PlanId
} from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";

const ROW_ID = "plans";
const REFRESH_MS = 30_000;

export interface UpdateOptions {
  note?: string;
  confirmLargePriceChange?: boolean;
}

// Plan prices and limits: the shipped defaults plus the super admin's overrides.
// The effective configuration lives in memory (shared getPlanConfig) so every
// price and limit check stays synchronous; each API instance re-reads the
// stored overrides every 30 s and straight after a change it makes itself.
//
// What an edit does and does not touch:
//  * prices apply to checkouts started AFTER the change — existing invoices and
//    orders already created are untouched (the amount is locked at checkout);
//  * a limit can be raised freely, but lowering one is refused while any
//    workspace on that plan is already above the new figure.
@Injectable()
export class PlanConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlanConfigService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((err) => this.logger.warn(`Could not load plan overrides, using defaults: ${err instanceof Error ? err.message : String(err)}`));
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), REFRESH_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh() {
    const row = await this.prisma.client.planConfigOverride.findUnique({ where: { id: ROW_ID } });
    setPlanConfig(applyPlanOverrides(DEFAULT_PLAN_CONFIG, (row?.data as PlanConfigOverrides | undefined) ?? null));
  }

  async state() {
    const row = await this.prisma.client.planConfigOverride.findUnique({ where: { id: ROW_ID } });
    const overrides = (row?.data as PlanConfigOverrides | undefined) ?? {};
    const subs = await this.prisma.client.subscription.groupBy({ by: ["planId"], _count: { _all: true } });
    const total = await this.prisma.client.workspace.count();
    const counts: Record<string, number> = Object.fromEntries(subs.map((s) => [s.planId, s._count._all]));
    counts.free = (counts.free ?? 0) + Math.max(0, total - subs.reduce((n, s) => n + s._count._all, 0));
    return { defaults: DEFAULT_PLAN_CONFIG, overrides, effective: getPlanConfig(), workspacesByPlan: counts, updatedAt: row?.updatedAt ?? null };
  }

  // Works out what saving these overrides would do, and what would stop it.
  async evaluate(overrides: PlanConfigOverrides) {
    const issues = validatePlanOverrides(overrides);
    const after = applyPlanOverrides(DEFAULT_PLAN_CONFIG, overrides);
    if (issues.length === 0) issues.push(...validatePlanConfig(after));
    const changes = diffPlanConfig(getPlanConfig(), after);
    return { issues, after, changes, large: changes.filter(isLargePriceChange), blocked: issues.length === 0 ? await this.limitDecreasesBlocked(changes) : [] };
  }

  async update(adminUserId: string, overrides: PlanConfigOverrides, options: UpdateOptions = {}) {
    const { issues, after, changes, large, blocked } = await this.evaluate(overrides);
    if (issues.length > 0) throw new BadRequestException({ message: issues[0], issues });
    if (changes.length === 0) return this.state();
    if (blocked.length > 0) {
      throw new ConflictException({ message: `Can't lower that limit yet: ${blocked.map((b) => `${b.workspaces} workspace${b.workspaces === 1 ? " is" : "s are"} above ${b.label}`).join("; ")}.`, blocked });
    }
    if (large.length > 0 && !options.confirmLargePriceChange) {
      throw new ConflictException({ message: `A price is changing by more than 25% (${large.map((c) => `${c.label}: ${c.before} → ${c.after}`).join(", ")}). Confirm to continue.`, requiresConfirmation: true, large });
    }

    // Store only what differs from the defaults, so "reset" is simply no row.
    const pruned = this.pruneToDefaults(after);
    await this.prisma.client.planConfigOverride.upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, data: pruned as Prisma.InputJsonValue, updatedById: adminUserId },
      update: { data: pruned as Prisma.InputJsonValue, updatedById: adminUserId }
    });
    setPlanConfig(after);
    await this.prisma.client.platformAuditLog.create({
      data: { userId: adminUserId, action: "plans.updated", detail: options.note ? `${describePlanChanges(changes)} (${options.note})` : describePlanChanges(changes) }
    });
    return this.state();
  }

  async reset(adminUserId: string) {
    const changes = diffPlanConfig(getPlanConfig(), DEFAULT_PLAN_CONFIG);
    const blocked = await this.limitDecreasesBlocked(changes);
    if (blocked.length > 0) throw new ConflictException({ message: `Can't reset yet: ${blocked.map((b) => `${b.workspaces} workspace(s) above ${b.label}`).join("; ")}.`, blocked });
    await this.prisma.client.planConfigOverride.deleteMany({ where: { id: ROW_ID } });
    setPlanConfig(DEFAULT_PLAN_CONFIG);
    await this.prisma.client.platformAuditLog.create({ data: { userId: adminUserId, action: "plans.reset", detail: describePlanChanges(changes) } });
    return this.state();
  }

  private pruneToDefaults(after: ReturnType<typeof applyPlanOverrides>): PlanConfigOverrides {
    const out: PlanConfigOverrides = {};
    for (const id of EDITABLE_PLAN_IDS) {
      for (const f of EDITABLE_PLAN_FIELDS) {
        if (after.plans[id][f] !== DEFAULT_PLAN_CONFIG.plans[id][f]) ((out.plans ??= {})[id] ??= {})[f] = after.plans[id][f] as number;
      }
    }
    for (const k of Object.keys(after.addonPrices) as (keyof typeof after.addonPrices)[]) if (after.addonPrices[k] !== DEFAULT_PLAN_CONFIG.addonPrices[k]) (out.addonPrices ??= {})[k] = after.addonPrices[k];
    for (const k of Object.keys(after.topupPrices) as (keyof typeof after.topupPrices)[]) if (after.topupPrices[k] !== DEFAULT_PLAN_CONFIG.topupPrices[k]) (out.topupPrices ??= {})[k] = after.topupPrices[k];
    return out;
  }

  // For each limit being lowered, how many workspaces on that plan are already
  // above the new figure (they'd be pushed into "over the limit").
  private async limitDecreasesBlocked(changes: PlanChange[]): Promise<{ label: string; workspaces: number }[]> {
    const blocked: { label: string; workspaces: number }[] = [];
    for (const change of changes.filter(isLimitDecrease)) {
      const [planId, field] = change.label.split(" ") as [PlanId, "users" | "instagramAccounts" | "contacts"];
      const subs = await this.prisma.client.subscription.findMany({ where: { planId }, select: { workspaceId: true }, take: 10_000 });
      const ids = subs.map((s) => s.workspaceId);
      if (ids.length === 0) continue;
      const rows =
        field === "contacts"
          ? await this.prisma.client.lead.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, mergedIntoId: null }, _count: { _all: true } })
          : field === "users"
            ? await this.prisma.client.membership.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, viaAgencyId: null }, _count: { _all: true } })
            : await this.prisma.client.instagramAccount.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, status: "active" }, _count: { _all: true } });
      const over = rows.filter((r) => r._count._all > (change.after ?? 0)).length;
      if (over > 0) blocked.push({ label: `${change.label.replace(" ", " ")} ${change.after}`, workspaces: over });
    }
    return blocked;
  }
}
