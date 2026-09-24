import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCustomFieldDto, UpdateCustomFieldDto } from "./dto/custom-field.dto";

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.client.customField.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  }

  async create(workspaceId: string, dto: CreateCustomFieldDto) {
    const existing = await this.prisma.client.customField.findUnique({
      where: { workspaceId_key: { workspaceId, key: dto.key } }
    });
    if (existing) throw new ConflictException(`A field with key "${dto.key}" already exists`);

    return this.prisma.client.customField.create({
      data: { workspaceId, ...dto, options: dto.options as Prisma.InputJsonValue | undefined }
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateCustomFieldDto) {
    const result = await this.prisma.client.customField.updateMany({
      where: { id, workspaceId },
      data: { ...dto, options: dto.options as Prisma.InputJsonValue | undefined }
    });
    if (result.count === 0) throw new NotFoundException("Custom field not found");
    return this.prisma.client.customField.findUniqueOrThrow({ where: { id } });
  }

  async remove(workspaceId: string, id: string) {
    const result = await this.prisma.client.customField.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Custom field not found");
  }
}
