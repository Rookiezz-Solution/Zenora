import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTaskDto, ListTasksQuery, UpdateTaskDto } from "./dto/tasks.dto";

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string, query: ListTasksQuery) {
    return this.prisma.client.task.findMany({
      where: {
        workspaceId,
        ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
        ...(query.leadId ? { leadId: query.leadId } : {}),
        ...(query.completed === "true" ? { completedAt: { not: null } } : {}),
        ...(query.completed === "false" ? { completedAt: null } : {})
      },
      include: { lead: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }]
    });
  }

  create(workspaceId: string, dto: CreateTaskDto) {
    return this.prisma.client.task.create({
      data: {
        workspaceId,
        title: dto.title,
        leadId: dto.leadId,
        assignedToId: dto.assignedToId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined
      }
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateTaskDto) {
    const result = await this.prisma.client.task.updateMany({
      where: { id, workspaceId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
        ...(dto.completed !== undefined ? { completedAt: dto.completed ? new Date() : null } : {})
      }
    });
    if (result.count === 0) throw new NotFoundException("Task not found");
    return this.prisma.client.task.findUniqueOrThrow({ where: { id } });
  }

  async remove(workspaceId: string, id: string) {
    const result = await this.prisma.client.task.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Task not found");
  }
}
