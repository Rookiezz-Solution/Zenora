import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreatePipelineDto,
  CreateStageDto,
  ReorderStagesDto,
  UpdatePipelineDto,
  UpdateStageDto
} from "./dto/pipelines.dto";

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(workspaceId: string) {
    return this.prisma.client.pipeline.findMany({
      where: { workspaceId },
      include: { stages: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" }
    });
  }

  async create(workspaceId: string, userId: string, dto: CreatePipelineDto) {
    const pipeline = await this.prisma.client.pipeline.create({ data: { workspaceId, ...dto } });
    await this.audit.log({ workspaceId, userId, action: "pipeline.created", entityType: "pipeline", entityId: pipeline.id });
    return pipeline;
  }

  async update(workspaceId: string, pipelineId: string, dto: UpdatePipelineDto) {
    await this.ensurePipeline(workspaceId, pipelineId);
    return this.prisma.client.pipeline.update({ where: { id: pipelineId }, data: dto });
  }

  async remove(workspaceId: string, pipelineId: string) {
    await this.ensurePipeline(workspaceId, pipelineId);
    await this.prisma.client.pipeline.delete({ where: { id: pipelineId } });
  }

  async addStage(workspaceId: string, pipelineId: string, dto: CreateStageDto) {
    await this.ensurePipeline(workspaceId, pipelineId);
    const maxOrder = await this.prisma.client.stage.aggregate({ where: { pipelineId }, _max: { order: true } });
    return this.prisma.client.stage.create({
      data: { pipelineId, order: (maxOrder._max.order ?? -1) + 1, ...dto }
    });
  }

  async updateStage(workspaceId: string, pipelineId: string, stageId: string, dto: UpdateStageDto) {
    await this.ensureStage(workspaceId, pipelineId, stageId);
    return this.prisma.client.stage.update({ where: { id: stageId }, data: dto });
  }

  async removeStage(workspaceId: string, pipelineId: string, stageId: string) {
    await this.ensureStage(workspaceId, pipelineId, stageId);
    await this.prisma.client.stage.delete({ where: { id: stageId } });
  }

  async reorderStages(workspaceId: string, pipelineId: string, dto: ReorderStagesDto) {
    await this.ensurePipeline(workspaceId, pipelineId);
    await this.prisma.client.$transaction(
      dto.stageIds.map((stageId, index) =>
        this.prisma.client.stage.updateMany({ where: { id: stageId, pipelineId }, data: { order: index } })
      )
    );
    return this.prisma.client.stage.findMany({ where: { pipelineId }, orderBy: { order: "asc" } });
  }

  async getBoard(workspaceId: string, pipelineId: string) {
    const pipeline = await this.prisma.client.pipeline.findFirst({
      where: { id: pipelineId, workspaceId },
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: {
            leads: {
              where: { mergedIntoId: null },
              include: { tags: { include: { tag: true } } },
              orderBy: { updatedAt: "desc" }
            }
          }
        }
      }
    });
    if (!pipeline) throw new NotFoundException("Pipeline not found");
    return pipeline;
  }

  private async ensurePipeline(workspaceId: string, pipelineId: string) {
    const pipeline = await this.prisma.client.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
    if (!pipeline) throw new NotFoundException("Pipeline not found");
    return pipeline;
  }

  private async ensureStage(workspaceId: string, pipelineId: string, stageId: string) {
    await this.ensurePipeline(workspaceId, pipelineId);
    const stage = await this.prisma.client.stage.findFirst({ where: { id: stageId, pipelineId } });
    if (!stage) throw new NotFoundException("Stage not found");
    return stage;
  }
}
