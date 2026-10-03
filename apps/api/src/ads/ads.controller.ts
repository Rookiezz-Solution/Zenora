import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { beginOAuth, completeOAuth } from "../common/oauth-state";
import { loadEnv } from "../config/env";
import { AdsService } from "./ads.service";
import { MetaAdsClient } from "./meta-ads.client";

const setActiveSchema = z.object({ active: z.boolean() });

@Controller("ads/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("reports.read")
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly metaAds: MetaAdsClient
  ) {}

  // Browser navigation: sends the signed-in user to Facebook Login to grant
  // read-only ad access. Whoever clicks it connects *their own* accounts.
  @Get("connect")
  @RequirePermission("settings.manage")
  connect(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string, @Res() res: Response) {
    res.redirect(this.metaAds.buildAuthUrl(beginOAuth(res, { workspaceId, userId })));
  }

  @Get("accounts")
  accounts(@Param("workspaceId") workspaceId: string) {
    return this.ads.listAccounts(workspaceId);
  }

  @Patch("accounts/:id")
  @RequirePermission("settings.manage")
  setActive(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @Body(new ZodValidationPipe(setActiveSchema)) body: unknown) {
    return this.ads.setActive(workspaceId, id, (body as { active: boolean }).active);
  }

  @Delete("accounts/:id")
  @RequirePermission("settings.manage")
  disconnect(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.ads.disconnect(workspaceId, id);
  }

  @Post("sync")
  @RequirePermission("settings.manage")
  sync(@Param("workspaceId") workspaceId: string) {
    return this.ads.sync(workspaceId);
  }

  @Get("report")
  report(@Param("workspaceId") workspaceId: string, @Query("days") days?: string) {
    return this.ads.report(workspaceId, Math.min(Math.max(Number(days) || 30, 1), 90));
  }
}

// Public: Facebook redirects the browser here after the user approves (or
// denies). Identity comes from the signed `state`, not a session cookie.
@Controller("ads/meta")
export class MetaAdsCallbackController {
  constructor(private readonly ads: AdsService) {}

  @Get("callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string, @Req() req: Request, @Res() res: Response) {
    const { APP_URL } = loadEnv();
    if (error || !code) {
      res.redirect(`${APP_URL}/sources?ads=denied`);
      return;
    }
    const payload = completeOAuth<{ workspaceId: string; userId: string }>(req, res, state);
    await this.ads.handleCallback(code, payload.workspaceId);
    res.redirect(`${APP_URL}/sources?ads=connected`);
  }
}
