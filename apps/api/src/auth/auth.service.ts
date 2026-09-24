import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { signSession } from "./jwt.util";
import { OtpSender } from "./otp-sender";
import type { LoginDto, OtpRequestDto, OtpVerifyDto, SignUpDto } from "./dto/auth.dto";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

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
    return { user: sanitizeUser(user), token: signSession({ sub: user.id }) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return { user: sanitizeUser(user), token: signSession({ sub: user.id }) };
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
    const user = await this.prisma.client.user.upsert({
      where: isEmail ? { email: dto.target } : { phone: dto.target },
      update: isEmail ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() },
      create: isEmail
        ? { email: dto.target, emailVerifiedAt: new Date() }
        : { email: `${dto.target}@otp.zenora.local`, phone: dto.target, phoneVerifiedAt: new Date() }
    });

    return { user: sanitizeUser(user), token: signSession({ sub: user.id }) };
  }

  async validateOrCreateGoogleUser(profile: { googleId: string; email: string; name?: string; avatarUrl?: string }) {
    const user = await this.prisma.client.user.upsert({
      where: { email: profile.email },
      update: { googleId: profile.googleId, name: profile.name, avatarUrl: profile.avatarUrl },
      create: {
        email: profile.email,
        googleId: profile.googleId,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        emailVerifiedAt: new Date()
      }
    });
    return { user: sanitizeUser(user), token: signSession({ sub: user.id }) };
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
