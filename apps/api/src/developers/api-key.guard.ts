import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiKeyScope } from "@zenora/shared";
import type { Request } from "express";
import { RateLimiter } from "../common/rate-limiter";
import { ApiKeysService, type AuthenticatedKey } from "./api-keys.service";

export interface ApiKeyRequest extends Request {
  apiKey?: AuthenticatedKey;
}

export const SCOPE_KEY = "api-key-scope";
export const RequireScope = (scope: ApiKeyScope) => SetMetadata(SCOPE_KEY, scope);

// Authenticates the public API (`Authorization: Bearer znr_live_...`). The
// workspace comes from the key itself, never from the URL or body, so a key
// can only ever touch its own workspace.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly limiter = new RateLimiter(120, 60_000);

  constructor(
    private readonly keys: ApiKeysService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyRequest>();
    const header = req.headers.authorization ?? "";
    const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const key = raw ? await this.keys.authenticate(raw) : null;
    if (!key) throw new UnauthorizedException("Missing or invalid API key");

    this.limiter.consume(key.id);

    const required = this.reflector.get<ApiKeyScope | undefined>(SCOPE_KEY, context.getHandler());
    if (required && !key.scopes.includes(required)) throw new ForbiddenException(`This API key does not have the ${required} scope`);

    req.apiKey = key;
    return true;
  }
}
