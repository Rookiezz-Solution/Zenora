import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "node:crypto";
import { Prisma } from "@zenora/db";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService
  ) {}

  // Meta retries deliveries that don't get a fast 200. Since most payloads
  // don't carry one stable event id, we hash the raw body — a retried
  // delivery has identical bytes, so the hash still dedupes it.
  async ingest(source: "instagram" | "whatsapp", rawBody: Buffer, payload: unknown) {
    const externalId = crypto.createHash("sha256").update(rawBody).digest("hex");
    try {
      const event = await this.prisma.client.metaWebhookEvent.create({
        data: { source, externalId, payload: payload as Prisma.InputJsonValue }
      });
      await this.queue.add("webhook-ingress", source, { eventId: event.id });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION) {
        this.logger.log(`Duplicate webhook delivery ignored (externalId=${externalId})`);
        return;
      }
      throw err;
    }
  }
}
