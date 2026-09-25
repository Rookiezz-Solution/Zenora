import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from "./dto/tasks.dto";
import { TasksService } from "./tasks.service";

@Controller("tasks/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("tasks.manage")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string, @Query(new ZodValidationPipe(listTasksQuerySchema)) query: unknown) {
    return this.tasks.list(workspaceId, query as never);
  }

  @Post()
  create(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(createTaskSchema)) body: unknown) {
    return this.tasks.create(workspaceId, body as never);
  }

  @Patch(":id")
  update(@Param("workspaceId") workspaceId: string, @Param("id") id: string, @Body(new ZodValidationPipe(updateTaskSchema)) body: unknown) {
    return this.tasks.update(workspaceId, id, body as never);
  }

  @Delete(":id")
  remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.tasks.remove(workspaceId, id);
  }
}
