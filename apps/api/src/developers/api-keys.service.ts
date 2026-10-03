import { Injectable, NotFoundException } from "@nestjs/common";
import { API_KEY_PREFIX, type ApiKeyScope } from "@zenora/shared";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateApiKeyDto } from "./developers.dto";

export interface AuthenticatedKey {
  id: string;
  workspaceId: string;
  scopes: ApiKeyScope[];
}

const TOUCH_AFTER_MS = 60_000;

export const hashApiKey = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  // The full key is returned exactly once, here. Only its SHA-256 is stored:
  // keys are 192 random bits, so a fast hash is enough and lets us look a key
  // up by hash directly.
  async create(workspaceId: string, userId: string, dto: CreateApiKeyDto) {
    const key = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
    const row = await this.prisma.client.apiKey.create({
      data: { workspaceId, name: dto.name, scopes: dto.scopes, createdById: userId, keyHash: hashApiKey(key), prefix: key.slice(0, API_KEY_PREFIX.length + 4) },
      select: { id: true, name: true, prefix: true, scopes: true, createdAt: true }
    });
    return { ...row, key };
  }

  list(workspaceId: string) {
    return this.prisma.client.apiKey.findMany({
      where: { workspaceId },
      select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async revoke(workspaceId: string, id: string) {
    const result = await this.prisma.client.apiKey.updateMany({ where: { id, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count === 0) throw new NotFoundException("API key not found");
    return { ok: true };
  }

  async authenticate(raw: string): Promise<AuthenticatedKey | null> {
    if (!raw.startsWith(API_KEY_PREFIX)) return null;
    const key = await this.prisma.client.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) } });
    if (!key || key.revokedAt) return null;
    // Best-effort "last used" without a write on every request.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
      this.prisma.client.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return { id: key.id, workspaceId: key.workspaceId, scopes: key.scopes as ApiKeyScope[] };
  }
}
