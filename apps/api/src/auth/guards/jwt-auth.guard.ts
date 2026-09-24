import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { loadEnv } from "../../config/env";
import { verifySession } from "../jwt.util";

export interface AuthedRequest extends Request {
  userId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const { SESSION_COOKIE_NAME } = loadEnv();
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException("Not signed in");
    }
    try {
      const payload = verifySession(token);
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException("Session expired");
    }
  }
}
