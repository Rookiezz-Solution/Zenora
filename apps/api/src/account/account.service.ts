import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { forgetSessionVersion } from "../auth/guards/jwt-auth.guard";
import { clearMembershipCache } from "../auth/guards/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  // "Delete my account". A person can't walk away from a business that would be
  // left with nobody in charge, so while they are the only owner of a workspace
  // they must delete it, or make someone else an owner, first.
  async deleteAccount(userId: string, confirmEmail: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) throw new BadRequestException("Type your email address exactly to confirm");

    const owned = await this.prisma.client.membership.findMany({ where: { userId, role: "owner" }, select: { workspace: { select: { id: true, name: true } } } });
    const sole: string[] = [];
    for (const m of owned) {
      const others = await this.prisma.client.membership.count({ where: { workspaceId: m.workspace.id, role: "owner", userId: { not: userId } } });
      if (others === 0) sole.push(m.workspace.name);
    }
    if (sole.length > 0) {
      throw new ConflictException(`You are the only owner of ${sole.map((n) => `"${n}"`).join(", ")}. Delete ${sole.length === 1 ? "it" : "them"}, or make someone else an owner, before deleting your account.`);
    }

    // Assignment history rows point at the user and would block the delete; the
    // rest (memberships, agency seats, referral code, sign-in codes) cascade.
    await this.prisma.client.$transaction([
      this.prisma.client.assignment.deleteMany({ where: { userId } }),
      this.prisma.client.user.delete({ where: { id: userId } })
    ]);
    forgetSessionVersion(userId);
    clearMembershipCache();
    return { deleted: true };
  }
}
