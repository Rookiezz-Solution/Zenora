import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { PLAN_LABELS, getPlanConfig, type PlanConfigOverrides } from "@zenora/shared";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralsService } from "../referrals/referrals.service";
import { PlanConfigService } from "../billing/plan-config.service";
import { FlowTemplatesService } from "../flow-templates/flow-templates.service";
import { OwnerConsoleService } from "./owner-console.service";
import { PlatformSettingsService } from "./platform-settings.service";
import { SuperAdminGuard, isSuperAdminEmail } from "./super-admin.guard";

const putSettingSchema = z.object({ value: z.string().max(500) });

const limitValue = z.number().int().min(0).max(10_000_000).nullable().optional();
const setLimitsSchema = z.object({ contacts: limitValue, users: limitValue, instagramAccounts: limitValue, note: z.string().trim().max(200).nullable().optional() });
const grantCreditsSchema = z.object({ amount: z.number().int().min(1).max(100_000), reason: z.string().trim().min(3).max(200) });
const overridesSchema = z.object({
  plans: z.record(z.record(z.number())).optional(),
  addonPrices: z.record(z.number()).optional(),
  topupPrices: z.record(z.number()).optional()
});
const updatePlansSchema = z.object({ overrides: overridesSchema, note: z.string().trim().max(200).optional(), confirmLargePriceChange: z.boolean().optional() });
const rejectTemplateSchema = z.object({ reason: z.string().trim().min(3).max(200) });
const payoutSchema = z.object({ referrerUserId: z.string().min(1), reference: z.string().trim().min(3).max(120), partnerInvoiceRef: z.string().trim().max(60).optional() });

@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly owner: OwnerConsoleService,
    private readonly referrals: ReferralsService,
    private readonly templates: FlowTemplatesService,
    private readonly planConfig: PlanConfigService
  ) {}

  @Get("overview")
  overview() {
    return this.owner.summary();
  }

  @Get("referrals")
  referralsOwed() {
    return this.referrals.owed();
  }

  // Records a payment you made outside Zenora; nothing is paid from here.
  @Post("referrals/payouts")
  recordPayout(@CurrentUser() userId: string, @Body(new ZodValidationPipe(payoutSchema)) body: unknown) {
    const { referrerUserId, reference, partnerInvoiceRef } = body as z.infer<typeof payoutSchema>;
    return this.referrals.recordPayout(userId, referrerUserId, reference, partnerInvoiceRef);
  }

  // Plan prices and limits. Changes apply to future purchases only (the price is
  // locked at checkout), limits can't be lowered under existing customers, and
  // every change is audited.
  @Get("plans")
  plans() {
    return this.planConfig.state();
  }

  @Post("plans/preview")
  async previewPlans(@Body(new ZodValidationPipe(z.object({ overrides: overridesSchema }))) body: unknown) {
    const { issues, changes, large, blocked } = await this.planConfig.evaluate((body as { overrides: PlanConfigOverrides }).overrides);
    return { issues, changes, requiresConfirmation: large.length > 0, blocked };
  }

  @Put("plans")
  updatePlans(@CurrentUser() userId: string, @Body(new ZodValidationPipe(updatePlansSchema)) body: unknown) {
    const { overrides, note, confirmLargePriceChange } = body as { overrides: PlanConfigOverrides; note?: string; confirmLargePriceChange?: boolean };
    return this.planConfig.update(userId, overrides, { note, confirmLargePriceChange });
  }

  @Delete("plans")
  resetPlans(@CurrentUser() userId: string) {
    return this.planConfig.reset(userId);
  }

  @Get("templates/pending")
  pendingTemplates() {
    return this.templates.pendingReview();
  }

  @Post("templates/:id/approve")
  approveTemplate(@Param("id") id: string, @CurrentUser() userId: string) {
    return this.templates.approve(userId, id);
  }

  @Post("templates/:id/reject")
  rejectTemplate(@Param("id") id: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(rejectTemplateSchema)) body: unknown) {
    return this.templates.reject(userId, id, (body as { reason: string }).reason);
  }

  @Get("workspaces")
  workspaces(@Query("search") search?: string) {
    return this.owner.listWorkspaces(search?.trim() || undefined);
  }

  @Get("workspaces/:id")
  workspace(@Param("id") id: string) {
    return this.owner.getWorkspace(id);
  }

  @Put("workspaces/:id/limits")
  setLimits(@Param("id") id: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(setLimitsSchema)) body: unknown) {
    return this.owner.setLimits(userId, id, body as z.infer<typeof setLimitsSchema>);
  }

  @Post("workspaces/:id/credits")
  grantCredits(@Param("id") id: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(grantCreditsSchema)) body: unknown) {
    const { amount, reason } = body as z.infer<typeof grantCreditsSchema>;
    return this.owner.grantCredits(userId, id, amount, reason);
  }

  @Get("integrations")
  integrations() {
    return this.settings.list();
  }

  @Put("integrations/:key")
  async put(@Param("key") key: string, @CurrentUser() userId: string, @Body(new ZodValidationPipe(putSettingSchema)) body: unknown) {
    await this.settings.set(userId, key, (body as { value: string }).value);
    return this.settings.list();
  }

  @Delete("integrations/:key")
  async remove(@Param("key") key: string, @CurrentUser() userId: string) {
    await this.settings.clear(userId, key);
    return this.settings.list();
  }
}

// Any signed-in user may ask "am I a super admin?" — the web app uses it to
// decide whether to show the Admin link. It grants nothing by itself.
@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminMeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  async me(@CurrentUser() userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { email: true } });
    return { isSuperAdmin: isSuperAdminEmail(user?.email) };
  }
}

// Unauthenticated: only ids the browser needs to start OAuth/checkout
// (never secrets), replacing build-time NEXT_PUBLIC_* variables so a super
// admin can set them from the dashboard.
@Controller("public/config")
export class PublicConfigController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  get() {
    return this.settings.publicConfig();
  }
}

// The pricing page and billing screen read prices and limits from here, so they
// always show what a checkout will actually charge.
@Controller("public/plans")
export class PublicPlansController {
  @Get()
  get() {
    const config = getPlanConfig();
    return { plans: config.plans, addonPrices: config.addonPrices, topupPrices: config.topupPrices, labels: PLAN_LABELS };
  }
}
