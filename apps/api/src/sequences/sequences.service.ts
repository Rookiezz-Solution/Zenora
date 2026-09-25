import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import type { SequenceStep } from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import type { CreateSequenceDto, EnrollLeadsDto, UpdateSequenceDto } from "./dto/sequences.dto";

@Injectable()
export class SequencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  list(workspaceId: string) {
    return this.prisma.client.sequence.findMany({
      where: { workspaceId },
      include: { _count: { select: { enrollments: { where: { status: "active" } } } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async getById(workspaceId: string, id: string) {
    const sequence = await this.prisma.client.sequence.findFirst({
      where: { id, workspaceId },
      include: { enrollments: { include: { lead: { select: { id: true, name: true, phone: true } } } } }
    });
    if (!sequence) throw new NotFoundException("Sequence not found");
    return sequence;
  }

  create(workspaceId: string, dto: CreateSequenceDto) {
    return this.prisma.client.sequence.create({
      data: { workspaceId, name: dto.name, steps: dto.steps as unknown as Prisma.InputJsonValue }
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateSequenceDto) {
    const result = await this.prisma.client.sequence.updateMany({
      where: { id, workspaceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.steps ? { steps: dto.steps as unknown as Prisma.InputJsonValue } : {})
      }
    });
    if (result.count === 0) throw new NotFoundException("Sequence not found");
    return this.prisma.client.sequence.findUniqueOrThrow({ where: { id } });
  }

  async remove(workspaceId: string, id: string) {
    const result = await this.prisma.client.sequence.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Sequence not found");
  }

  async enroll(workspaceId: string, id: string, dto: EnrollLeadsDto) {
    const sequence = await this.prisma.client.sequence.findFirst({ where: { id, workspaceId } });
    if (!sequence) throw new NotFoundException("Sequence not found");
    const steps = sequence.steps as unknown as SequenceStep[];
    if (steps.length === 0) throw new NotFoundException("Sequence has no steps");

    const alreadyEnrolled = await this.prisma.client.sequenceEnrollment.findMany({
      where: { sequenceId: id, leadId: { in: dto.leadIds }, status: "active" },
      select: { leadId: true }
    });
    const skip = new Set(alreadyEnrolled.map((e) => e.leadId));
    const toEnroll = dto.leadIds.filter((leadId) => !skip.has(leadId));

    const enrollments = await Promise.all(
      toEnroll.map((leadId) => this.prisma.client.sequenceEnrollment.create({ data: { sequenceId: id, leadId } }))
    );
    await Promise.all(
      enrollments.map((enrollment) =>
        this.queue.add("sequences", "step", { enrollmentId: enrollment.id }, steps[0]!.waitHours * 3_600_000)
      )
    );

    return { enrolled: enrollments.length, skipped: skip.size };
  }

  async stop(workspaceId: string, id: string, leadId: string) {
    const sequence = await this.prisma.client.sequence.findFirst({ where: { id, workspaceId } });
    if (!sequence) throw new NotFoundException("Sequence not found");
    await this.prisma.client.sequenceEnrollment.updateMany({
      where: { sequenceId: id, leadId, status: "active" },
      data: { status: "stopped" }
    });
  }
}
