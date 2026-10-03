import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthedRequest } from "../auth/guards/jwt-auth.guard";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (loadEnv().SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

// Platform-level access (not a workspace role). Run after JwtAuthGuard. The
// allowlist lives in the environment, so it can't be edited through the app.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.userId ? await this.prisma.client.user.findUnique({ where: { id: req.userId }, select: { email: true } }) : null;
    if (!isSuperAdminEmail(user?.email)) throw new ForbiddenException("Super admin only");
    return true;
  }
}
