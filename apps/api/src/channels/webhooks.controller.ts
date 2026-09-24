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

    // Always ack fast — Meta retries (and eventually disables the
    // subscription) if we don't return 200 quickly, even for payloads we
    // don't recognise yet.
    res.status(200).send("EVENT_RECEIVED");

    if (!source) {
      this.logger.warn(`Ignoring webhook with unknown object type: ${body.object}`);
      return;
    }
    await this.webhooks.ingest(source, req.rawBody ?? Buffer.from(JSON.stringify(body)), body);
  }
}
