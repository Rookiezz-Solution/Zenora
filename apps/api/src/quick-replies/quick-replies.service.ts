import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateQuickReplyDto, UpdateQuickReplyDto } from "./dto/quick-reply.dto";

@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.client.quickReply.findMany({ where: { workspaceId }, orderBy: { shortcut: "asc" } });
  }

  create(workspaceId: string, dto: CreateQuickReplyDto) {
    return this.prisma.client.quickReply.create({ data: { workspaceId, ...dto } });
  }

  async update(workspaceId: string, id: string, dto: UpdateQuickReplyDto) {
    const result = await this.prisma.client.quickReply.updateMany({ where: { id, workspaceId }, data: dto });
    if (result.count === 0) throw new NotFoundException("Quick reply not found");
    return this.prisma.client.quickReply.findUniqueOrThrow({ where: { id } });
  }

  async remove(workspaceId: string, id: string) {
    const result = await this.prisma.client.quickReply.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Quick reply not found");
  }
}
