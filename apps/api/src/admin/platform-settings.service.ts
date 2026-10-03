import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { INTEGRATION_GROUPS, findIntegrationField, groupStatus } from "@zenora/shared";
import { decryptToken, encryptToken } from "../common/encryption";
import { envSource, loadEnv, setRuntimeOverrides } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

const REFRESH_MS = 60_000;

@Injectable()
export class PlatformSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((err) => this.logger.error("Could not load platform settings", err instanceof Error ? err.stack : String(err)));
    // Re-read periodically so every API instance converges after a change.
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Decrypts every stored value into the in-memory override map that
  // loadEnv() merges over process.env.
  async refresh() {
    const rows = await this.prisma.client.platformSetting.findMany();
    const next: Record<string, string> = {};
    for (const row of rows) {
      try {
        next[row.key] = decryptToken(row.valueCipher);
      } catch {
        this.logger.warn(`Skipping platform setting ${row.key}: could not decrypt (was TOKEN_ENCRYPTION_KEY changed?)`);
      }
    }
    setRuntimeOverrides(next);
  }

  async set(userId: string, key: string, value: string) {
    if (!findIntegrationField(key)) throw new BadRequestException("Unknown setting");
    const trimmed = value.trim();
    if (!trimmed) return this.clear(userId, key);
    if (/[\r\n]/.test(trimmed)) throw new BadRequestException("Value must be a single line");

    await this.prisma.client.platformSetting.upsert({
      where: { key },
      create: { key, valueCipher: encryptToken(trimmed), updatedByUserId: userId },
      update: { valueCipher: encryptToken(trimmed), updatedByUserId: userId }
    });
    // Audit records which key changed, never the value.
    await this.prisma.client.platformAuditLog.create({ data: { userId, action: "setting.set", key } });
    await this.refresh();
  }

  async clear(userId: string, key: string) {
    if (!findIntegrationField(key)) throw new BadRequestException("Unknown setting");
    await this.prisma.client.platformSetting.deleteMany({ where: { key } });
    await this.prisma.client.platformAuditLog.create({ data: { userId, action: "setting.cleared", key } });
    await this.refresh();
  }

  // Secret values are never included — only whether they're set.
  list() {
    const env = loadEnv() as unknown as Record<string, string | undefined>;
    const apiUrl = loadEnv().API_URL;
    const isSet = (key: string) => envSource(key) !== "none";
    return INTEGRATION_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      status: groupStatus(group, isSet),
      restartRequired: group.restartRequired ?? false,
      setupLinks: (group.setupLinks ?? []).map((l) => ({ label: l.label, url: `${apiUrl}${l.path}` })),
      fields: group.fields.map((f) => ({
        key: f.key,
        label: f.label,
        secret: f.secret,
        help: f.help ?? null,
        configured: isSet(f.key),
        source: envSource(f.key),
        value: f.secret ? null : (env[f.key] ?? null)
      }))
    }));
  }

  // Only keys the browser genuinely needs (OAuth/app ids, never secrets).
  publicConfig() {
    const env = loadEnv();
    return {
      metaAppId: env.META_APP_ID || null,
      metaWhatsappConfigId: env.META_WHATSAPP_CONFIG_ID || null,
      razorpayKeyId: env.RAZORPAY_KEY_ID || null
    };
  }

}
