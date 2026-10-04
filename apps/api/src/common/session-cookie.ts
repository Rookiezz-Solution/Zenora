import type { CookieOptions, Response } from "express";
import { loadEnv } from "../config/env";

// How the session cookie is set and cleared. Normally "lax": the web app and the
// API sit on the same site (app.example.com and api.example.com). When they are
// on different sites (a free-tier test deployment on two *.onrender.com
// addresses) the browser only sends the cookie on the web app's requests to the
// API if it is SameSite=None, which in turn requires Secure.
function baseOptions(): CookieOptions {
  const { NODE_ENV, SESSION_COOKIE_SAMESITE } = loadEnv();
  return { httpOnly: true, secure: NODE_ENV === "production" || SESSION_COOKIE_SAMESITE === "none", sameSite: SESSION_COOKIE_SAMESITE, path: "/" };
}

export function setSessionCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(loadEnv().SESSION_COOKIE_NAME, token, { ...baseOptions(), maxAge: maxAgeMs });
}

export function clearSessionCookie(res: Response): void {
  // Must carry the attributes it was set with, or some browsers keep the old cookie.
  res.clearCookie(loadEnv().SESSION_COOKIE_NAME, baseOptions());
}
