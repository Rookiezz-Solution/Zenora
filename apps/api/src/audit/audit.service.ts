import { Injectable } from "@nestjs/common";
import type { Prisma } from "@zenora/db";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  workspaceId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonObject;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata ?? {},
        ipAddress: entry.ipAddress
      }
    });
  }
}
