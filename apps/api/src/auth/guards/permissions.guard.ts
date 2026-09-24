import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { roleHasPermission, type Permission, type WorkspaceRole } from "@zenora/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import type { AuthedRequest } from "./jwt-auth.guard";

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

    const membership = await this.prisma.client.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.userId } }
    });
    if (!membership || !roleHasPermission(membership.role as WorkspaceRole, required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
