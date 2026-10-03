import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { callbackRequestSchema, upsertLinkInBioSchema } from "./link-in-bio.dto";
import { LinkInBioService } from "./link-in-bio.service";

@Controller("link-in-bio/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("settings.manage")
export class LinkInBioController {
  constructor(private readonly linkInBio: LinkInBioService) {}

  @Get()
  get(@Param("workspaceId") workspaceId: string) {
    return this.linkInBio.get(workspaceId);
  }

  @Put()
  upsert(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(upsertLinkInBioSchema)) body: unknown) {
    return this.linkInBio.upsert(workspaceId, body as never);
  }
}

// Unauthenticated on purpose: this is the public page a business links from
// its Instagram bio.
@Controller("public/link-in-bio/:slug")
export class PublicLinkInBioController {
  constructor(private readonly linkInBio: LinkInBioService) {}

  @Get()
  get(@Param("slug") slug: string) {
    return this.linkInBio.getPublic(slug);
  }

  @Post("callback")
  callback(@Param("slug") slug: string, @Req() req: Request, @Body(new ZodValidationPipe(callbackRequestSchema)) body: unknown) {
    return this.linkInBio.submitCallback(slug, req.ip ?? "unknown", body as never);
  }
}
