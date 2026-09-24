import { prisma, type Prisma } from "@zenora/db";
import type { FlowBlock, FlowGraph } from "@zenora/shared";
import { decryptToken } from "../decrypt-token";
import { sendInstagramMessage, sendWhatsappText } from "../meta-send";
import { publishInboxEvent } from "../realtime";
import { enqueueResume } from "./queue";

const MAX_STEPS_PER_TICK = 50; // guards against a cyclic graph looping forever

export async function startRun(automationId: string, leadId: string, conversationId: string) {
  const run = await prisma.automationRun.create({ data: { automationId, leadId, status: "running" } });
  const automation = await prisma.automation.findUniqueOrThrow({
    where: { id: automationId },
    include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } }
  });
  const graph = automation.versions[0]?.graph as unknown as FlowGraph | undefined;
  if (!graph) {
    await prisma.automationRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date() } });
    return;
  }
  await walk(run.id, automation.workspaceId, leadId, conversationId, graph, graph.startBlockId);
}

export async function resumeRun(runId: string, blockId: string) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { automation: { include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } } } }
  });
  if (!run || run.status !== "running" || !run.leadId) return;
  const graph = run.automation.versions[0]?.graph as unknown as FlowGraph | undefined;
  const conversation = await prisma.conversation.findFirst({ where: { leadId: run.leadId } });
  if (!graph || !conversation) return;
  await walk(run.id, run.automation.workspaceId, run.leadId, conversation.id, graph, blockId);
}

async function walk(
  runId: string,
  workspaceId: string,
  leadId: string,
  conversationId: string,
  graph: FlowGraph,
  startBlockId: string
) {
  let currentId: string | null = startBlockId;
  let steps = 0;

  while (currentId && steps < MAX_STEPS_PER_TICK) {
    steps++;
    const block: FlowBlock | undefined = graph.blocks[currentId];
    if (!block) break;

    try {
      const result = await executeBlock(workspaceId, leadId, conversationId, block);
      await prisma.runStep.create({
        data: { runId, blockId: block.id, type: block.type, output: (result.output ?? {}) as Prisma.InputJsonValue, status: "ok" }
      });

      if (result.wait) {
        if (result.wait.next) {
          await enqueueResume(runId, result.wait.next, result.wait.minutes);
        } else {
          await prisma.automationRun.update({ where: { id: runId }, data: { status: "completed", completedAt: new Date() } });
        }
        return; // suspend — the "automation-engine" queue resumes us later
      }
      currentId = result.next;
    } catch (err) {
      await prisma.runStep.create({
        data: { runId, blockId: block.id, type: block.type, status: "error", output: { error: String(err) } }
      });
      await prisma.automationRun.update({ where: { id: runId }, data: { status: "failed", completedAt: new Date() } });
      return;
    }

    if (block.type === "handover") break;
  }

  await prisma.automationRun.update({ where: { id: runId }, data: { status: "completed", completedAt: new Date() } });
}

interface BlockResult {
  next: string | null;
  output?: Record<string, unknown>;
  wait?: { next: string | null; minutes: number };
}

async function executeBlock(workspaceId: string, leadId: string, conversationId: string, block: FlowBlock): Promise<BlockResult> {
  switch (block.type) {
    case "send_text":
      await sendToConversation(workspaceId, conversationId, block.body);
      return { next: block.next, output: { sent: block.body } };

    case "send_quick_replies": {
      // Core engine sends these as plain text (see docs/PROGRESS.md) — real
      // interactive buttons need WhatsApp's "interactive" message type /
      // Instagram's quick-reply API, not wired up yet. We simulate the
      // first option being picked so the flow still progresses.
      const body = `${block.body}\n${block.options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}`;
      await sendToConversation(workspaceId, conversationId, body);
      return { next: block.options[0]?.next ?? null, output: { sent: body } };
    }

    case "condition": {
      const passed = await evaluateCondition(leadId, block.field, block.operator, block.value);
      return { next: passed ? block.ifTrue : block.ifFalse, output: { passed } };
    }

    case "wait":
      return { next: null, wait: { next: block.next, minutes: block.minutes }, output: { waitingMinutes: block.minutes } };

    case "tag": {
      const tag = await prisma.tag.upsert({
        where: { workspaceId_name: { workspaceId, name: block.tagName } },
        update: {},
        create: { workspaceId, name: block.tagName }
      });
      await prisma.leadTag.upsert({
        where: { leadId_tagId: { leadId, tagId: tag.id } },
        update: {},
        create: { leadId, tagId: tag.id }
      });
      return { next: block.next, output: { tagged: block.tagName } };
    }

    case "move_stage": {
      const stage = await prisma.stage.findUnique({ where: { id: block.stageId } });
      if (stage) {
        await prisma.lead.update({ where: { id: leadId }, data: { stageId: stage.id, pipelineId: stage.pipelineId } });
      }
      return { next: block.next, output: { movedToStageId: block.stageId, found: !!stage } };
    }

    case "assign":
      await prisma.lead.update({ where: { id: leadId }, data: { ownerId: block.userId } });
      if (block.userId) {
        await prisma.assignment.create({ data: { leadId, userId: block.userId } });
      }
      return { next: block.next, output: { assignedToUserId: block.userId } };

    case "handover":
      await prisma.conversation.update({ where: { id: conversationId }, data: { botActive: false } });
      await publishInboxEvent({
        workspaceId,
        type: "conversation.updated",
        payload: await prisma.conversation.findUnique({ where: { id: conversationId } })
      });
      return { next: null, output: { handedOver: true } };
  }
}

async function evaluateCondition(leadId: string, field: "tag" | "stage" | "score", operator: "equals" | "contains" | "gte", value: string): Promise<boolean> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { tags: { include: { tag: true } }, stage: true }
  });
  if (field === "score") {
    return operator === "gte" ? lead.score >= Number(value) : String(lead.score) === value;
  }
  if (field === "stage") {
    const name = lead.stage?.name ?? "";
    return operator === "contains" ? name.toLowerCase().includes(value.toLowerCase()) : name === value;
  }
  // field === "tag"
  const names = lead.tags.map((t) => t.tag.name.toLowerCase());
  return operator === "contains" ? names.some((n) => n.includes(value.toLowerCase())) : names.includes(value.toLowerCase());
}

async function sendToConversation(workspaceId: string, conversationId: string, body: string) {
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const externalId =
    conversation.channel === "instagram"
      ? await sendViaInstagram(workspaceId, conversation.leadId!, body)
      : await sendViaWhatsapp(workspaceId, conversation.leadId!, body);

  const message = await prisma.message.create({
    data: { conversationId, direction: "outbound", type: "text", body, externalId, status: "sent" }
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  await publishInboxEvent({ workspaceId, type: "message.created", payload: message });
}

async function sendViaInstagram(workspaceId: string, leadId: string, body: string): Promise<string> {
  const [account, identity] = await Promise.all([
    prisma.instagramAccount.findFirst({ where: { workspaceId } }),
    prisma.leadIdentity.findFirst({ where: { leadId, type: "ig_scoped_id" } })
  ]);
  if (!account || !identity) throw new Error("No connected Instagram account or lead identity");
  return sendInstagramMessage(account.igUserId, identity.value, body, decryptToken(account.accessTokenCipher));
}

async function sendViaWhatsapp(workspaceId: string, leadId: string, body: string): Promise<string> {
  const [number, identity] = await Promise.all([
    prisma.whatsappNumber.findFirst({ where: { workspaceId } }),
    prisma.leadIdentity.findFirst({ where: { leadId, type: "wa_phone" } })
  ]);
  if (!number || !identity) throw new Error("No connected WhatsApp number or lead identity");
  return sendWhatsappText(number.phoneNumberId, identity.value, body, decryptToken(number.accessTokenCipher));
}
