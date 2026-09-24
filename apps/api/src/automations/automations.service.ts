import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import { validateFlowGraph, type FlowBlock, type FlowGraph } from "@zenora/shared";
import { AuditService } from "../audit/audit.service";
import type { SaveAsTemplateDto } from "../flow-templates/dto/flow-templates.dto";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateAutomationDto,
  SaveDraftDto,
  SetTriggerDto,
  TestRunDto,
  UpdateAutomationDto
} from "./dto/automations.dto";

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(workspaceId: string, status?: string) {
    const automations = await this.prisma.client.automation.findMany({
      where: { workspaceId, ...(status ? { status: status as never } : {}) },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        _count: { select: { runs: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
    return automations.map(({ versions, _count, ...automation }) => ({
      ...automation,
      latestVersion: versions[0] ?? null,
      runCount: _count.runs
    }));
  }

  async create(workspaceId: string, userId: string, dto: CreateAutomationDto) {
    const automation = await this.prisma.client.automation.create({ data: { workspaceId, ...dto } });
    await this.prisma.client.automationVersion.create({
      data: { automationId: automation.id, version: 1, graph: EMPTY_GRAPH as unknown as Prisma.InputJsonValue }
    });
    await this.audit.log({ workspaceId, userId, action: "automation.created", entityType: "automation", entityId: automation.id });
    return this.getById(workspaceId, automation.id);
  }

  async getById(workspaceId: string, id: string) {
    const automation = await this.prisma.client.automation.findFirst({
      where: { id, workspaceId },
      include: { trigger: true, versions: { orderBy: { version: "desc" } } }
    });
    if (!automation) throw new NotFoundException("Automation not found");
    return { ...automation, draft: automation.versions[0] ?? null };
  }

  async update(workspaceId: string, id: string, dto: UpdateAutomationDto) {
    await this.ensure(workspaceId, id);
    return this.prisma.client.automation.update({ where: { id }, data: dto });
  }

  async remove(workspaceId: string, id: string) {
    await this.ensure(workspaceId, id);
    await this.prisma.client.automation.delete({ where: { id } });
  }

  async duplicate(workspaceId: string, id: string, userId: string) {
    const source = await this.getById(workspaceId, id);
    const copy = await this.prisma.client.automation.create({
      data: { workspaceId, name: `${source.name} (copy)`, folder: source.folder }
    });
    await this.prisma.client.automationVersion.create({
      data: { automationId: copy.id, version: 1, graph: (source.draft?.graph ?? EMPTY_GRAPH) as Prisma.InputJsonValue }
    });
    await this.audit.log({ workspaceId, userId, action: "automation.duplicated", entityType: "automation", entityId: copy.id });
    return this.getById(workspaceId, copy.id);
  }

  // docs/PRD.md: "'Save as template' from any flow." Captures the current
  // draft graph as-is (including this workspace's own copy on the flow
  // templates gallery) — variable substitution happens the other direction,
  // when a template is turned back into an automation.
  async saveAsTemplate(workspaceId: string, id: string, userId: string, dto: SaveAsTemplateDto) {
    const automation = await this.getById(workspaceId, id);
    const graph = automation.draft?.graph ?? EMPTY_GRAPH;
    const template = await this.prisma.client.flowTemplate.create({
      data: { workspaceId, name: dto.name, industry: dto.industry, scope: "private", graph: graph as Prisma.InputJsonValue }
    });
    await this.audit.log({
      workspaceId,
      userId,
      action: "automation.saved_as_template",
      entityType: "flow_template",
      entityId: template.id,
      metadata: { automationId: id }
    });
    return template;
  }

  // Autosaves the flow builder's in-progress graph. Only mutates the
  // current version while it's still a draft (publishedAt null) — once
  // published a version is immutable, so further edits start a new one.
  async saveDraft(workspaceId: string, id: string, dto: SaveDraftDto) {
    const automation = await this.getById(workspaceId, id);
    if (automation.draft && !automation.draft.publishedAt) {
      await this.prisma.client.automationVersion.update({
        where: { id: automation.draft.id },
        data: { graph: dto.graph as unknown as Prisma.InputJsonValue }
      });
    } else {
      const nextVersion = (automation.draft?.version ?? 0) + 1;
      await this.prisma.client.automationVersion.create({
        data: { automationId: id, version: nextVersion, graph: dto.graph as unknown as Prisma.InputJsonValue }
      });
    }
    return this.getById(workspaceId, id);
  }

  async setTrigger(workspaceId: string, id: string, userId: string, dto: SetTriggerDto) {
    const automation = await this.ensure(workspaceId, id);
    const trigger = automation.triggerId
      ? await this.prisma.client.trigger.update({
          where: { id: automation.triggerId },
          data: { type: dto.type, config: dto.config as Prisma.InputJsonValue }
        })
      : await this.prisma.client.trigger.create({ data: { type: dto.type, config: dto.config as Prisma.InputJsonValue } });
    if (!automation.triggerId) {
      await this.prisma.client.automation.update({ where: { id }, data: { triggerId: trigger.id } });
    }
    await this.audit.log({ workspaceId, userId, action: "automation.trigger_set", entityType: "automation", entityId: id });
    return this.getById(workspaceId, id);
  }

  async publish(workspaceId: string, id: string, userId: string) {
    const automation = await this.getById(workspaceId, id);
    if (!automation.triggerId) {
      throw new ConflictException("Set a trigger before publishing");
    }
    if (!automation.draft) {
      throw new ConflictException("Nothing to publish");
    }
    const graph = automation.draft.graph as unknown as FlowGraph;
    const issues = validateFlowGraph(graph);
    if (issues.length > 0) {
      throw new BadRequestException({ message: "Fix the flow before publishing", issues });
    }

    if (!automation.draft.publishedAt) {
      await this.prisma.client.automationVersion.update({
        where: { id: automation.draft.id },
        data: { publishedAt: new Date() }
      });
    }
    await this.prisma.client.automation.update({ where: { id }, data: { status: "live" } });
    await this.audit.log({ workspaceId, userId, action: "automation.published", entityType: "automation", entityId: id });
    return this.getById(workspaceId, id);
  }

  async setStatus(workspaceId: string, id: string, userId: string, status: "paused" | "live") {
    const automation = await this.ensure(workspaceId, id);
    if (status === "live" && !automation.triggerId) {
      throw new ConflictException("This automation has never been published");
    }
    await this.prisma.client.automation.update({ where: { id }, data: { status } });
    await this.audit.log({
      workspaceId,
      userId,
      action: status === "paused" ? "automation.paused" : "automation.resumed",
      entityType: "automation",
      entityId: id
    });
    return this.getById(workspaceId, id);
  }

  async versions(workspaceId: string, id: string) {
    await this.ensure(workspaceId, id);
    return this.prisma.client.automationVersion.findMany({ where: { automationId: id }, orderBy: { version: "desc" } });
  }

  async restoreVersion(workspaceId: string, id: string, version: number, userId: string) {
    const automation = await this.getById(workspaceId, id);
    const target = await this.prisma.client.automationVersion.findUnique({
      where: { automationId_version: { automationId: id, version } }
    });
    if (!target) throw new NotFoundException("Version not found");

    const nextVersion = (automation.draft?.version ?? 0) + 1;
    await this.prisma.client.automationVersion.create({
      data: { automationId: id, version: nextVersion, graph: target.graph as Prisma.InputJsonValue }
    });
    await this.audit.log({
      workspaceId,
      userId,
      action: "automation.version_restored",
      entityType: "automation",
      entityId: id,
      metadata: { restoredFromVersion: version }
    });
    return this.getById(workspaceId, id);
  }

  async stats(workspaceId: string, id: string) {
    await this.ensure(workspaceId, id);
    const [byStatus, recentRuns, steps] = await Promise.all([
      this.prisma.client.automationRun.groupBy({ by: ["status"], where: { automationId: id }, _count: true }),
      this.prisma.client.automationRun.findMany({
        where: { automationId: id },
        orderBy: { startedAt: "desc" },
        take: 20,
        include: { lead: { select: { id: true, name: true, phone: true } } }
      }),
      this.prisma.client.runStep.groupBy({
        by: ["blockId", "type", "status"],
        where: { run: { automationId: id } },
        _count: true
      })
    ]);
    return {
      runsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      stepFunnel: steps.map((s) => ({ blockId: s.blockId, type: s.type, status: s.status, count: s._count })),
      recentRuns
    };
  }

  // Dry-run: walks the published (or draft, if never published) graph from
  // the trigger without calling the real Graph API or touching a real lead —
  // docs/PRD.md: "test to own Instagram/WhatsApp (test runs don't create
  // leads)". We don't have a way to actually deliver to the tester's own
  // account without a configured Meta app, so this logs the *intended*
  // action at each block instead of sending it — still exercises the whole
  // graph-walking logic for real.
  async testRun(workspaceId: string, id: string, userId: string, dto: TestRunDto) {
    const automation = await this.getById(workspaceId, id);
    const graph = (automation.draft?.graph ?? EMPTY_GRAPH) as unknown as FlowGraph;
    const issues = validateFlowGraph(graph);
    if (issues.length > 0) {
      throw new BadRequestException({ message: "Fix the flow before testing", issues });
    }

    const run = await this.prisma.client.automationRun.create({
      data: { automationId: id, status: "running" }
    });

    const steps: Array<{ blockId: string; type: string; output: Record<string, unknown> }> = [];
    let currentId: string | null = graph.startBlockId;
    let guard = 0;
    while (currentId && guard < 50) {
      guard++;
      const block: FlowBlock | undefined = graph.blocks[currentId];
      if (!block) break;
      const output = describeTestStep(block, dto);
      steps.push({ blockId: block.id, type: block.type, output });
      await this.prisma.client.runStep.create({
        data: { runId: run.id, blockId: block.id, type: block.type, output: output as Prisma.InputJsonValue, status: "ok" }
      });
      currentId = nextBlockId(block);
    }

    await this.prisma.client.automationRun.update({ where: { id: run.id }, data: { status: "completed", completedAt: new Date() } });
    await this.audit.log({ workspaceId, userId, action: "automation.tested", entityType: "automation", entityId: id });
    return { runId: run.id, steps };
  }

  private async ensure(workspaceId: string, id: string) {
    const automation = await this.prisma.client.automation.findFirst({ where: { id, workspaceId } });
    if (!automation) throw new NotFoundException("Automation not found");
    return automation;
  }
}

const EMPTY_GRAPH: FlowGraph = { startBlockId: "start", blocks: {} };

function nextBlockId(block: FlowBlock): string | null {
  switch (block.type) {
    case "send_text":
    case "wait":
    case "tag":
    case "move_stage":
    case "assign":
      return block.next;
    case "send_quick_replies":
      return block.options[0]?.next ?? null; // test mode: simulate picking the first option
    case "condition":
      return block.ifTrue; // test mode: simulate the condition passing
    case "handover":
      return null;
  }
}

function describeTestStep(block: FlowBlock, dto: TestRunDto): Record<string, unknown> {
  switch (block.type) {
    case "send_text":
      return { wouldSend: block.body, channel: dto.channel };
    case "send_quick_replies":
      return { wouldSend: block.body, options: block.options.map((o) => o.label), channel: dto.channel };
    case "condition":
      return { wouldCheck: `${block.field} ${block.operator} ${block.value}`, simulatedResult: true };
    case "wait":
      return { wouldWaitMinutes: block.minutes, skippedInTest: true };
    case "tag":
      return { wouldTag: block.tagName };
    case "move_stage":
      return { wouldMoveToStageId: block.stageId };
    case "assign":
      return { wouldAssignToUserId: block.userId };
    case "handover":
      return { wouldHandOverToHuman: true };
  }
}
