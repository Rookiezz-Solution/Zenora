import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OwnerConsoleService } from "./owner-console.service";
import { PlatformSettingsService } from "./platform-settings.service";
import { SuperAdminGuard, isSuperAdminEmail } from "./super-admin.guard";

const putSettingSchema = z.object({ value: z.string().max(500) });

const limitValue = z.number().int().min(0).max(10_000_000).nullable().optional();
const setLimitsSchema = z.object({ contacts: limitValue, users: limitValue, instagramAccounts: limitValue, note: z.string().trim().max(200).nullable().optional() });
const grantCreditsSchema = z.object({ amount: z.number().int().min(1).max(100_000), reason: z.string().trim().min(3).max(200) });

@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly owner: OwnerConsoleService
  ) {}

  @Get("overview")
  overview() {
    return this.owner.summary();
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
