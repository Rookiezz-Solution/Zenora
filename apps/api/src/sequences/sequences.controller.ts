import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { createSequenceSchema, enrollLeadsSchema, updateSequenceSchema } from "./dto/sequences.dto";
import { SequencesService } from "./sequences.service";

@Controller("sequences/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.write")
export class SequencesController {
  constructor(private readonly sequences: SequencesService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string) {
    return this.sequences.list(workspaceId);
  }

  @Post()
  create(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createSequenceSchema)) body: unknown) {
    return this.sequences.create(workspaceId, body as never);
  }

  @Get(":id")
  getById(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.sequences.getById(workspaceId, id);
  }

  @Patch(":id")
  update(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @Body(new ZodValidationPipe(updateSequenceSchema)) body: unknown) {
    return this.sequences.update(workspaceId, id, body as never);
  }

  @Delete(":id")
  remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.sequences.remove(workspaceId, id);
  }

  @Post(":id/enroll")
  enroll(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @Body(new ZodValidationPipe(enrollLeadsSchema)) body: unknown) {
    return this.sequences.enroll(workspaceId, id, body as never);
  }

  @Post(":id/leads/:leadId/stop")
  stop(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @Param("leadId") leadId: string) {
    return this.sequences.stop(workspaceId, id, leadId);
  }
}
