import jwt from "jsonwebtoken";
import { loadEnv } from "../config/env";

// Signed, short-lived `state` param for Meta OAuth redirects — carries which
// workspace/user initiated the connect flow through Meta's redirect so the
// callback can't be tricked into attaching a token to the wrong workspace.
export function signOAuthState(payload: Record<string, string>): string {
  return jwt.sign(payload, loadEnv().AUTH_SECRET, { expiresIn: 600 });
}

export function verifyOAuthState<T extends Record<string, string>>(state: string): T {
  return jwt.verify(state, loadEnv().AUTH_SECRET) as T;
}
