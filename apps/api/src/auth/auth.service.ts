import { ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { signSession } from "./jwt.util";
import { forgetSessionVersion } from "./guards/jwt-auth.guard";
import { OtpSender } from "./otp-sender";
import type { ChangePasswordDto, LoginDto, OtpRequestDto, OtpVerifyDto, PasswordResetDto, SignUpDto } from "./dto/auth.dto";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

// Compared against when the email is unknown, so a missing account takes as long
// to reject as a wrong password (otherwise response time reveals who has an account).
const DUMMY_HASH = bcrypt.hashSync("zenora-timing-equaliser", 12);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpSender: OtpSender
  ) {}

  async signUp(dto: SignUpDto) {
    const existing = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.client.user.create({
      data: { email: dto.email, passwordHash, name: dto.name }
    });
    return { user: sanitizeUser(user), token: signSession({ sub: user.id, ver: user.sessionVersion }) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user?.passwordHash || !passwordOk) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return { user: sanitizeUser(user), token: signSession({ sub: user.id, ver: user.sessionVersion }) };
  }

  async requestOtp(dto: OtpRequestDto) {
    const resetting = dto.purpose === "password_reset";
    // A reset must not reveal whether an address has an account: unknown
    // addresses get the same answer, take as long, and are simply sent nothing.
    // It is also refused up front, for everyone alike, when no code could be
    // delivered, so that refusal cannot be used to tell accounts apart either.
    if (resetting && !this.otpSender.canDeliver(dto.target)) {
      throw new ServiceUnavailableException("Password reset emails can't be sent yet. Please sign in with Google, or contact support.");
    }
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = await bcrypt.hash(code, 10);
    if (resetting) {
      const user = await this.prisma.client.user.findUnique({ where: { email: dto.target }, select: { id: true } });
      if (!user) return { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
    }
    await this.prisma.client.otpCode.create({
      data: {
        target: dto.target,
        purpose: dto.purpose,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000)
      }
    });
    if (resetting) {
      // A failure here must look exactly like success to the caller: otherwise
      // "could not send" appears only for real accounts and gives them away.
      // It is logged for whoever runs the platform.
      await this.otpSender.send(dto.target, code, dto.purpose).catch((err) => this.logger.error(`Could not send a password-reset code: ${err instanceof Error ? err.message : String(err)}`));
    } else {
      await this.otpSender.send(dto.target, code, dto.purpose);
    }
    return { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
  }

  // Checks a code and uses it up. Five wrong guesses and the code is dead.
  private async consumeOtp(target: string, purpose: string, code: string): Promise<void> {
    const record = await this.prisma.client.otpCode.findFirst({
      where: { target, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (!record || record.expiresAt < new Date() || record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException("Code expired or invalid, request a new one");
    }
    const valid = await bcrypt.compare(code, record.codeHash);
    if (!valid) {
      await this.prisma.client.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } }
      });
      throw new UnauthorizedException("Incorrect code");
    }
    await this.prisma.client.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() }
    });
  }

  // Sets a new password for someone who proved they own the email with a code.
  // Every session they had is signed out, and a password someone else may have
  // set at sign-up is replaced, so the real owner ends up in control.
  async resetPassword(dto: PasswordResetDto) {
    await this.consumeOtp(dto.email, "password_reset", dto.code);
    const existing = await this.prisma.client.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (!existing) throw new UnauthorizedException("Code expired or invalid, request a new one");
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const user = await this.prisma.client.user.update({
      where: { id: existing.id },
      data: { passwordHash, emailVerifiedAt: new Date(), sessionVersion: { increment: 1 } }
    });
    forgetSessionVersion(user.id);
    return { user: sanitizeUser(user), token: signSession({ sub: user.id, ver: user.sessionVersion }) };
  }

  // A signed-in person changes their own password. Other devices are signed out;
  // this one is given a fresh session.
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const current = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    if (current.passwordHash) {
      const ok = dto.currentPassword ? await bcrypt.compare(dto.currentPassword, current.passwordHash) : false;
      if (!ok) throw new UnauthorizedException("Your current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const user = await this.prisma.client.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    forgetSessionVersion(user.id);
    return { user: sanitizeUser(user), token: signSession({ sub: user.id, ver: user.sessionVersion }) };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    await this.consumeOtp(dto.target, dto.purpose, dto.code);

    const isEmail = dto.target.includes("@");
    const claim = isEmail ? await this.claimUnverifiedAccount(dto.target) : {};
    const user = await this.prisma.client.user.upsert({
      where: isEmail ? { email: dto.target } : { phone: dto.target },
      update: isEmail ? { emailVerifiedAt: new Date(), ...claim } : { phoneVerifiedAt: new Date() },
      create: isEmail
        ? { email: dto.target, emailVerifiedAt: new Date() }
        : { email: `${dto.target}@otp.zenora.local`, phone: dto.target, phoneVerifiedAt: new Date() }
    });
    forgetSessionVersion(user.id);

    return { user: sanitizeUser(user), token: signSession({ sub: user.id, ver: user.sessionVersion }) };
  }

  async validateOrCreateGoogleUser(profile: { googleId: string; email: string; name?: string; avatarUrl?: string }) {
    const claim = await this.claimUnverifiedAccount(profile.email);
    const user = await this.prisma.client.user.upsert({
      where: { email: profile.email },
      update: { googleId: profile.googleId, name: profile.name, avatarUrl: profile.avatarUrl, emailVerifiedAt: new Date(), ...claim },
      create: {
        email: profile.email,
        googleId: profile.googleId,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        emailVerifiedAt: new Date()
      }
    });
    forgetSessionVersion(user.id);
    return { user: sanitizeUser(user), token: signSession({ sub: user.id, ver: user.sessionVersion }) };
  }

  // Sign-up with a password never proves you own the email, so anyone could
  // register a victim's address first and keep their password. When the real
  // owner later proves the address (email code or Google), the account is taken
  // back: the password is removed and every existing session is signed out.
  private async claimUnverifiedAccount(email: string): Promise<{ passwordHash?: null; sessionVersion?: { increment: number } }> {
    const existing = await this.prisma.client.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true, passwordHash: true } });
    if (!existing || existing.emailVerifiedAt) return {};
    forgetSessionVersion(existing.id);
    return existing.passwordHash ? { passwordHash: null, sessionVersion: { increment: 1 } } : {};
  }

  // Ends every session this person has, on every device: the version in their
  // session tokens no longer matches. Takes effect within seconds (the guard
  // re-reads the version at most every 15 s per process).
  async signOutEverywhere(userId: string): Promise<void> {
    await this.prisma.client.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    forgetSessionVersion(userId);
  }

  async me(userId: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    return sanitizeUser(user);
  }
}

function sanitizeUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
