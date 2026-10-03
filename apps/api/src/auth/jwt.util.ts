import jwt from "jsonwebtoken";
import { loadEnv } from "../config/env";

export interface SessionPayload {
  sub: string; // user id
  ver: number; // User.sessionVersion at sign-in; a later bump signs this session out
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
// A separate audience keeps session tokens and OAuth `state` tokens (both
// signed with AUTH_SECRET) from being accepted in place of one another.
const AUDIENCE = "zenora:session";

export function signSession(payload: SessionPayload): string {
  const { AUTH_SECRET } = loadEnv();
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: SESSION_TTL_SECONDS, audience: AUDIENCE });
}

export function verifySession(token: string): SessionPayload {
  const { AUTH_SECRET } = loadEnv();
  const payload = jwt.verify(token, AUTH_SECRET, { audience: AUDIENCE }) as Partial<SessionPayload>;
  if (typeof payload.sub !== "string" || typeof payload.ver !== "number") throw new Error("Malformed session");
  return payload as SessionPayload;
}

export const SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;
