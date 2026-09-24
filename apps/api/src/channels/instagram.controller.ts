import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { loadEnv } from "../config/env";
import { signOAuthState, verifyOAuthState } from "../common/oauth-state";
import { InstagramService } from "./instagram.service";

@Controller("channels/instagram")
export class InstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @Get("connect/:workspaceId")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission("channels.manage")
  connect(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string, @Res() res: Response) {
    const state = signOAuthState({ workspaceId, userId });
    res.redirect(this.instagram.buildAuthorizeUrl(state));
  }

  // Public: Meta redirects the browser here after the user approves (or
  // denies) the Instagram permissions dialog. Identity/authorization comes
  // from the signed `state`, not from a session cookie.
  @Get("callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string, @Res() res: Response) {
    const { APP_URL } = loadEnv();
    if (error || !code) {
      res.redirect(`${APP_URL}/settings?instagram=denied`);
      return;
    }
    let payload: { workspaceId: string; userId: string };
    try {
      payload = verifyOAuthState(state);
    } catch {
      throw new BadRequestException("Invalid or expired OAuth state");
    }
    await this.instagram.handleCallback(code, payload.workspaceId, payload.userId);
    res.redirect(`${APP_URL}/settings?instagram=connected`);
  }
}
