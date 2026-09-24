import jwt from "jsonwebtoken";
import { loadEnv } from "../config/env";

export interface SessionPayload {
  sub: string; // user id
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function signSession(payload: SessionPayload): string {
  const { AUTH_SECRET } = loadEnv();
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token: string): SessionPayload {
  const { AUTH_SECRET } = loadEnv();
  return jwt.verify(token, AUTH_SECRET) as SessionPayload;
}

export const SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;
