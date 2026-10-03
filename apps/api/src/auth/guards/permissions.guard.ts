import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { roleHasPermission, type Permission, type WorkspaceRole } from "@zenora/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import type { AuthedRequest } from "./jwt-auth.guard";

// A member's role is trusted for this long before it is read again, so a busy
// page doesn't pay a database round trip per request just to re-learn it.
// Changes made through this API (role change, removal, agency access) clear it
// immediately; a change made by another API instance takes at most this long.
// Only successful lookups are cached, so a newly added member works straight away.
const ROLE_CACHE_MS = 10_000;
const roleCache = new Map<string, { role: WorkspaceRole; at: number }>();
const roleKey = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`;

export function forgetMembership(workspaceId: string, userId: string) {
  roleCache.delete(roleKey(workspaceId, userId));
}
export function clearMembershipCache() {
  roleCache.clear();
}

// Runs after JwtAuthGuard. Resolves the caller's role for the workspace in
// the route (:workspaceId) and checks it against the handler's
// @RequirePermission(...). CLAUDE.md rule #7: every check is workspace-scoped
// — there is no such thing as a permission that isn't tied to a workspaceId.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Method-level @RequirePermission wins over a class-level default, same
    // as Nest's own guard/interceptor override semantics.
    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const workspaceId = req.params?.workspaceId;
    if (!req.userId || !workspaceId) {
      throw new ForbiddenException("Missing workspace context");
    }

    const key = roleKey(workspaceId, req.userId);
    let role: WorkspaceRole | undefined;
    const cached = roleCache.get(key);
    if (cached && Date.now() - cached.at < ROLE_CACHE_MS) {
      role = cached.role;
    } else {
      const membership = await this.prisma.client.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: req.userId } }
      });
      role = membership?.role as WorkspaceRole | undefined;
      if (role) roleCache.set(key, { role, at: Date.now() });
      else roleCache.delete(key);
    }
    if (!role || !roleHasPermission(role, required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
