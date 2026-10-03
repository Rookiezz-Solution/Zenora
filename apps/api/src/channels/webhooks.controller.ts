import { Controller, Get, Logger, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { loadEnv } from "../config/env";
import { MetaSignatureGuard } from "./meta-signature.guard";
import { WebhooksService } from "./webhooks.service";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller("webhooks/meta")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooks: WebhooksService) {}

  // Meta's one-time subscription handshake: echo back hub.challenge if the
  // verify token matches what was configured in the App Dashboard.
  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response
  ) {
    const { META_WEBHOOK_VERIFY_TOKEN } = loadEnv();
    if (mode === "subscribe" && token && META_WEBHOOK_VERIFY_TOKEN && token === META_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send("Verification failed");
  }

  @Post()
  @UseGuards(MetaSignatureGuard)
  async receive(@Req() req: RawBodyRequest, @Res() res: Response) {
    const body = req.body as { object?: string };
    const source = body.object === "instagram" ? "instagram" : body.object === "whatsapp_business_account" ? "whatsapp" : null;

    // Unrecognised payloads are acknowledged and dropped, so Meta doesn't keep
    // retrying (or disable the subscription over) something we'll never handle.
    if (!source) {
      this.logger.warn(`Ignoring webhook with unknown object type: ${body.object}`);
      res.status(200).send("EVENT_RECEIVED");
      return;
    }

    // The event is stored (and queued) BEFORE it is acknowledged. Acknowledging
    // first looked faster, but Meta treats a 200 as "delivered" and never resends:
    // if the save then failed — a crash, or the database pool saturated by a
    // burst — the message was lost for good. Failing here returns a 500 instead,
    // and Meta retries; the content hash makes the retry idempotent.
    try {
      await this.webhooks.ingest(source, req.rawBody ?? Buffer.from(JSON.stringify(body)), body);
      res.status(200).send("EVENT_RECEIVED");
    } catch (err) {
      this.logger.error(`Could not store ${source} webhook: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).send("RETRY");
    }
  }
}
