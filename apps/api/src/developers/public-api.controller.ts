import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { ApiKeyGuard, RequireScope, type ApiKeyRequest } from "./api-key.guard";
import { publicCreateLeadSchema, publicListLeadsSchema, type PublicCreateLeadDto, type PublicListLeadsQuery } from "./developers.dto";
import { PublicApiService } from "./public-api.service";

// The public REST API, versioned under /v1. Auth is an API key, not a session;
// the workspace always comes from the key.
@Controller("v1")
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly api: PublicApiService) {}

  @Get("leads")
  @RequireScope("leads:read")
  list(@Req() req: ApiKeyRequest, @Query(new ZodValidationPipe(publicListLeadsSchema)) query: unknown) {
    return this.api.listLeads(req.apiKey!.workspaceId, query as PublicListLeadsQuery);
  }

  @Get("leads/:id")
  @RequireScope("leads:read")
  get(@Req() req: ApiKeyRequest, @Param("id") id: string) {
    return this.api.getLead(req.apiKey!.workspaceId, id);
  }

  @Post("leads")
  @RequireScope("leads:write")
  create(@Req() req: ApiKeyRequest, @Body(new ZodValidationPipe(publicCreateLeadSchema)) body: unknown) {
    return this.api.createLead(req.apiKey!.workspaceId, body as PublicCreateLeadDto);
  }
}
