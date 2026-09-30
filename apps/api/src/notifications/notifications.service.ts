import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const LIST_LIMIT = 50;

export interface CreateNotificationInput {
  workspaceId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string;
  channel?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // userId is left null — workspace-wide alerts (billing, AI credits) are
  // visible to the whole team rather than targeted per-recipient. Only
  // "app" channel is created here; WhatsApp/email delivery for alerts is a
  // follow-up (docs/PROGRESS.md simplification).
  create(input: CreateNotificationInput) {
    return this.prisma.client.notification.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        channel: input.channel ?? "app"
      }
    });
  }

  list(workspaceId: string) {
    return this.prisma.client.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT
    });
  }

  async markRead(workspaceId: string, id: string) {
    const result = await this.prisma.client.notification.updateMany({
      where: { id, workspaceId },
      data: { readAt: new Date() }
    });
    if (result.count === 0) throw new NotFoundException("Notification not found");
    return this.prisma.client.notification.findUniqueOrThrow({ where: { id } });
  }
}
