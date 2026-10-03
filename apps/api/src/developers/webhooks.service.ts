import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { checkWebhookUrl, leadWebhookData, type WebhookEvent } from "@zenora/shared";
import { Prisma } from "@zenora/db";
import * as crypto from "node:crypto";
import { encryptToken } from "../common/encryption";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import type { CreateWebhookDto, UpdateWebhookDto } from "./developers.dto";

const PUBLIC_FIELDS = { id: true, url: true, description: true, events: true, active: true, createdAt: true } as const;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  private checkUrl(raw: string): string {
    const result = checkWebhookUrl(raw, { allowPrivate: loadEnv().WEBHOOK_ALLOW_PRIVATE === "true" });
    if (!result.ok) throw new BadRequestException(result.reason);
    return result.url;
  }

  // The signing secret is returned once, at creation; after that it is only
  // ever decrypted by the worker to sign deliveries.
  async create(workspaceId: string, dto: CreateWebhookDto) {
    const url = this.checkUrl(dto.url);
    const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
    const row = await this.prisma.client.webhookEndpoint.create({
      data: { workspaceId, url, description: dto.description, events: dto.events, secretCipher: encryptToken(secret) },
      select: PUBLIC_FIELDS
    });
    return { ...row, secret };
  }

  list(workspaceId: string) {
    return this.prisma.client.webhookEndpoint.findMany({ where: { workspaceId }, select: PUBLIC_FIELDS, orderBy: { createdAt: "desc" } });
  }

  async update(workspaceId: string, id: string, dto: UpdateWebhookDto) {
    const data = { ...dto, ...(dto.url ? { url: this.checkUrl(dto.url) } : {}) };
    const result = await this.prisma.client.webhookEndpoint.updateMany({ where: { id, workspaceId }, data });
    if (result.count === 0) throw new NotFoundException("Webhook not found");
    return this.prisma.client.webhookEndpoint.findUniqueOrThrow({ where: { id }, select: PUBLIC_FIELDS });
  }

  async remove(workspaceId: string, id: string) {
    const result = await this.prisma.client.webhookEndpoint.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Webhook not found");
    return { ok: true };
  }

  async deliveries(workspaceId: string, endpointId: string) {
    const endpoint = await this.prisma.client.webhookEndpoint.findFirst({ where: { id: endpointId, workspaceId }, select: { id: true } });
    if (!endpoint) throw new NotFoundException("Webhook not found");
    return this.prisma.client.webhookDelivery.findMany({
      where: { endpointId },
      select: { id: true, event: true, status: true, attempts: true, responseStatus: true, error: true, createdAt: true, deliveredAt: true },
      orderBy: { createdAt: "desc" },
      take: 30
    });
  }

  // For callers that only have a lead id (public forms, booking).
  async emitLeadCreated(workspaceId: string, leadId: string): Promise<void> {
    try {
      const lead = await this.prisma.client.lead.findUnique({ where: { id: leadId } });
      if (lead) await this.emit(workspaceId, "lead.created", leadWebhookData(lead));
    } catch (err) {
      this.logger.warn(`Could not queue lead.created webhooks: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async sendTest(workspaceId: string, id: string) {
    const endpoint = await this.prisma.client.webhookEndpoint.findFirst({ where: { id, workspaceId } });
    if (!endpoint) throw new NotFoundException("Webhook not found");
    await this.enqueue(workspaceId, endpoint.id, "ping", { message: "This is a test event from Zenora." });
    return { ok: true };
  }

  // Fan an event out to every active endpoint subscribed to it. Called from the
  // middle of other features (creating a lead, booking), so it must never
  // throw: a webhook problem can't be allowed to fail the real action.
  async emit(workspaceId: string, event: WebhookEvent, data: unknown): Promise<void> {
    try {
      const endpoints = await this.prisma.client.webhookEndpoint.findMany({
        where: { workspaceId, active: true, events: { has: event } },
        select: { id: true }
      });
      for (const endpoint of endpoints) await this.enqueue(workspaceId, endpoint.id, event, data);
    } catch (err) {
      this.logger.warn(`Could not queue ${event} webhooks: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async enqueue(workspaceId: string, endpointId: string, event: string, data: unknown) {
    const id = crypto.randomUUID();
    const payload = { id, event, createdAt: new Date().toISOString(), workspaceId, data };
    await this.prisma.client.webhookDelivery.create({ data: { id, workspaceId, endpointId, event, payload: payload as Prisma.InputJsonValue } });
    await this.queue.add("webhooks", "deliver", { deliveryId: id });
  }
}
