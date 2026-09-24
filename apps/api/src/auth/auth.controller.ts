import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { loadEnv } from "../config/env";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { loginSchema, otpRequestSchema, otpVerifySchema, signUpSchema } from "./dto/auth.dto";
import { ZodValidationPipe } from "./dto/zod-validation.pipe";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { SESSION_COOKIE_MAX_AGE_MS } from "./jwt.util";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  async signUp(@Body(new ZodValidationPipe(signUpSchema)) body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.signUp(body as never);
    setSessionCookie(res, result.token);
    return { user: result.user };
  }

  @Post("login")
  async login(@Body(new ZodValidationPipe(loginSchema)) body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body as never);
    setSessionCookie(res, result.token);
    return { user: result.user };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    const { SESSION_COOKIE_NAME } = loadEnv();
    res.clearCookie(SESSION_COOKIE_NAME);
    return { signedOut: true };
  }

  @Post("otp/request")
  requestOtp(@Body(new ZodValidationPipe(otpRequestSchema)) body: unknown) {
    return this.authService.requestOtp(body as never);
  }

  @Post("otp/verify")
  async verifyOtp(@Body(new ZodValidationPipe(otpVerifySchema)) body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyOtp(body as never);
    setSessionCookie(res, result.token);
    return { user: result.user };
  }

  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleLogin() {
    // Redirect handled by passport-google-oauth20.
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleCallback(@Req() req: Request & { user: { googleId: string; email: string; name?: string; avatarUrl?: string } }, @Res() res: Response) {
    const result = await this.authService.validateOrCreateGoogleUser(req.user);
    setSessionCookie(res, result.token);
    const { APP_URL } = loadEnv();
    res.redirect(`${APP_URL}/`);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() userId: string) {
    return this.authService.me(userId);
  }
}

function setSessionCookie(res: Response, token: string) {
  const { SESSION_COOKIE_NAME, NODE_ENV } = loadEnv();
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE_MS
  });
}
