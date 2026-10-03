import { Body, Controller, Delete, Get, Param, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformSettingsService } from "./platform-settings.service";
import { SuperAdminGuard, isSuperAdminEmail } from "./super-admin.guard";

const putSettingSchema = z.object({ value: z.string().max(500) });

@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get("overview")
  overview() {
    return this.settings.overview();
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
