import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { loadEnv } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { verifySession } from "../jwt.util";

export interface AuthedRequest extends Request {
  userId?: string;
}

// How long a user's session version is trusted before it is looked up again.
// Short enough that signing everyone out takes effect within seconds, long
// enough that a busy page doesn't turn into a query per request.
const VERSION_CACHE_MS = 15_000;
const versionCache = new Map<string, { version: number; at: number }>();

export function forgetSessionVersion(userId: string) {
  versionCache.delete(userId);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const { SESSION_COOKIE_NAME } = loadEnv();
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException("Not signed in");
    }
    let payload;
    try {
      payload = verifySession(token);
    } catch {
      throw new UnauthorizedException("Session expired");
    }
    if ((await this.currentVersion(payload.sub)) !== payload.ver) throw new UnauthorizedException("Session expired");
    req.userId = payload.sub;
    return true;
  }

  private async currentVersion(userId: string): Promise<number | null> {
    const cached = versionCache.get(userId);
    if (cached && Date.now() - cached.at < VERSION_CACHE_MS) return cached.version;
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
    if (!user) return null; // deleted user
    versionCache.set(userId, { version: user.sessionVersion, at: Date.now() });
    return user.sessionVersion;
  }
}
