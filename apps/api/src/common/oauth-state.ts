import * as crypto from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { loadEnv } from "../config/env";

const AUDIENCE = "zenora:oauth";
const NONCE_COOKIE = "zenora_oauth_nonce";
const TTL_SECONDS = 600;

// The `state` of a Meta/Google connect flow says which workspace and user
// started it. On its own that is not enough: an attacker can start a flow in
// their own session, then trick someone else into finishing it in *their*
// browser — attaching the victim's Instagram/Google/ad account to the
// attacker's workspace. So the state also carries a random nonce that is set as
// an httpOnly cookie in the browser that started the flow, and the callback
// only proceeds when both match.
export function beginOAuth(res: Response, payload: Record<string, string>): string {
  const nonce = crypto.randomBytes(18).toString("base64url");
  res.cookie(NONCE_COOKIE, nonce, { httpOnly: true, secure: loadEnv().NODE_ENV === "production", sameSite: "lax", maxAge: TTL_SECONDS * 1000 });
  return jwt.sign({ ...payload, nonce }, loadEnv().AUTH_SECRET, { expiresIn: TTL_SECONDS, audience: AUDIENCE });
}

export function completeOAuth<T extends Record<string, string>>(req: Request, res: Response, state: string): T {
  let decoded: T & { nonce?: string };
  try {
    decoded = jwt.verify(state, loadEnv().AUTH_SECRET, { audience: AUDIENCE }) as T & { nonce?: string };
  } catch {
    throw new BadRequestException("Invalid or expired OAuth state");
  }
  const cookie = (req.cookies as Record<string, string> | undefined)?.[NONCE_COOKIE];
  res.clearCookie(NONCE_COOKIE); // single use
  const a = Buffer.from(cookie ?? "");
  const b = Buffer.from(decoded.nonce ?? "");
  if (!cookie || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new BadRequestException("This connection attempt did not start in this browser. Please start it again from Zenora.");
  }
  const { nonce: _nonce, iat: _iat, exp: _exp, aud: _aud, ...payload } = decoded as T & { nonce?: string; iat?: number; exp?: number; aud?: string };
  return payload as unknown as T;
}
