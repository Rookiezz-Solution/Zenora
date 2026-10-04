import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { signSession } from "./jwt.util";
import { forgetSessionVersion } from "./guards/jwt-auth.guard";
import { OtpSender } from "./otp-sender";
import type { LoginDto, OtpRequestDto, OtpVerifyDto, SignUpDto } from "./dto/auth.dto";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

// Compared against when the email is unknown, so a missing account takes as long
// to reject as a wrong password (otherwise response time reveals who has an account).
const DUMMY_HASH = bcrypt.hashSync("zenora-timing-equaliser", 12);

@Injectable()
export class AuthService {
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
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = await bcrypt.hash(code, 10);
    await this.prisma.client.otpCode.create({
      data: {
        target: dto.target,
        purpose: dto.purpose,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000)
      }
    });
    await this.otpSender.send(dto.target, code);
    return { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const record = await this.prisma.client.otpCode.findFirst({
      where: { target: dto.target, purpose: dto.purpose, consumedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (!record || record.expiresAt < new Date() || record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException("Code expired or invalid, request a new one");
    }
    const valid = await bcrypt.compare(dto.code, record.codeHash);
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
