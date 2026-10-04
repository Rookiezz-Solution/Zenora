import * as crypto from "node:crypto";
import { loadEnv } from "../config/env";

// The link a guest keeps to change or cancel their own booking. It is an HMAC of
// the appointment id, so it needs no extra column and cannot be forged or
// guessed; it only works while the appointment is still booked and in the future.
function mac(appointmentId: string): string {
  return crypto.createHmac("sha256", loadEnv().AUTH_SECRET).update(`appointment-manage:${appointmentId}`).digest("base64url");
}

export function appointmentManageKey(appointmentId: string): string {
  return `${appointmentId}.${mac(appointmentId)}`;
}

// Returns the appointment id for a valid key, otherwise null.
export function parseAppointmentManageKey(key: string): string | null {
  const dot = key.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = key.slice(0, dot);
  const given = Buffer.from(key.slice(dot + 1));
  const expected = Buffer.from(mac(id));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? id : null;
}
