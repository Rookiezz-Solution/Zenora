import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import {
  createFaqSchema,
  createKnowledgeSourceSchema,
  generateFaqsSchema,
  testChatSchema,
  updateAiSettingsSchema,
  updateFaqSchema,
  updateKnowledgeSourceSchema
} from "./dto/knowledge.dto";
import { KnowledgeService } from "./knowledge.service";

@Controller("knowledge/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("knowledge.manage")
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get("sources")
  listSources(@Param("workspaceId") workspaceId: string) {
    return this.knowledge.listSources(workspaceId);
  }

  @Post("sources")
  createSource(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createKnowledgeSourceSchema)) body: unknown) {
    return this.knowledge.createSource(workspaceId, body as never);
  }

  @Patch("sources/:id")
  updateSource(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateKnowledgeSourceSchema)) body: unknown
  ) {
    return this.knowledge.updateSource(workspaceId, id, body as never);
  }

  @Delete("sources/:id")
  removeSource(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.knowledge.removeSource(workspaceId, id);
  }

  @Get("faqs")
  listFaqs(@Param("workspaceId") workspaceId: string) {
    return this.knowledge.listFaqs(workspaceId);
  }

  @Post("faqs")
  createFaq(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createFaqSchema)) body: unknown) {
    return this.knowledge.createFaq(workspaceId, body as never);
  }

  @Patch("faqs/:id")
  updateFaq(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @Body(new ZodValidationPipe(updateFaqSchema)) body: unknown) {
    return this.knowledge.updateFaq(workspaceId, id, body as never);
  }

  @Delete("faqs/:id")
  removeFaq(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.knowledge.removeFaq(workspaceId, id);
  }

  @Post("faqs/generate")
  generateFaqs(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(generateFaqsSchema)) body: unknown) {
    return this.knowledge.generateFaqs(workspaceId, body as never);
  }

  @Get("settings")
  getSettings(@Param("workspaceId") workspaceId: string) {
    return this.knowledge.getSettings(workspaceId);
  }

  @Patch("settings")
  updateSettings(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(updateAiSettingsSchema)) body: unknown) {
    return this.knowledge.updateSettings(workspaceId, body as never);
  }

  @Post("test-chat")
  testChat(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(testChatSchema)) body: unknown) {
    return this.knowledge.testChat(workspaceId, body as never);
  }
}
