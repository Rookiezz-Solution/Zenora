import { Injectable, Logger } from "@nestjs/common";
import { encryptToken } from "../common/encryption";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { MetaGraphClient } from "./meta-graph.client";
import type { ConnectWhatsappDto } from "./dto/whatsapp.dto";

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly meta: MetaGraphClient
  ) {}

  async connect(workspaceId: string, userId: string, dto: ConnectWhatsappDto) {
    const accessToken = await this.meta.exchangeWhatsappCode(dto.code);

    await this.meta.subscribeWabaWebhooks(dto.wabaId, accessToken).catch((err) => {
      // Non-fatal: the number is still connected, but inbound messages won't
      // arrive until this succeeds — surfaced to the owner as a channel
      // warning once Settings > Connect channels ships (Phase 1 UI).
      this.logger.error(`Failed to subscribe WABA ${dto.wabaId} to webhooks`, err);
    });

    const { displayPhoneNumber } = await this.meta.getPhoneNumberDetails(dto.phoneNumberId, accessToken);

    const number = await this.prisma.client.whatsappNumber.upsert({
      where: { phoneNumberId: dto.phoneNumberId },
      update: { workspaceId, wabaId: dto.wabaId, accessTokenCipher: encryptToken(accessToken), displayPhoneNumber, status: "active" },
      create: {
        workspaceId,
        wabaId: dto.wabaId,
        phoneNumberId: dto.phoneNumberId,
        displayPhoneNumber,
        accessTokenCipher: encryptToken(accessToken)
      }
    });

    await this.audit.log({
      workspaceId,
      userId,
      action: "channel.whatsapp_connected",
      entityType: "whatsapp_number",
      entityId: number.id,
      metadata: { displayPhoneNumber }
    });

    return number;
  }
}
