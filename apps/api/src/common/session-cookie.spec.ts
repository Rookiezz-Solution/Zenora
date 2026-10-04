import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../config/env", () => ({ loadEnv: () => env.current }));

import { clearSessionCookie, setSessionCookie } from "./session-cookie";

const res = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });

beforeEach(() => {
  env.current = { NODE_ENV: "development", SESSION_COOKIE_NAME: "zenora_session", SESSION_COOKIE_SAMESITE: "lax" };
});

describe("session cookie", () => {
  it("is httpOnly, SameSite=Lax and not Secure in development", () => {
    const r = res();
    setSessionCookie(r as never, "tok", 1000);
    expect(r.cookie).toHaveBeenCalledWith("zenora_session", "tok", { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 1000 });
  });

  it("is Secure in production", () => {
    env.current = { ...env.current, NODE_ENV: "production" };
    const r = res();
    setSessionCookie(r as never, "tok", 1000);
    expect(r.cookie.mock.calls[0]![2]).toMatchObject({ secure: true, sameSite: "lax" });
  });

  it("when the web app and API are on different sites it is SameSite=None, which forces Secure", () => {
    env.current = { ...env.current, SESSION_COOKIE_SAMESITE: "none" };
    const r = res();
    setSessionCookie(r as never, "tok", 1000);
    expect(r.cookie.mock.calls[0]![2]).toMatchObject({ sameSite: "none", secure: true, httpOnly: true });
  });

  it("clears with the same attributes it was set with", () => {
    env.current = { ...env.current, SESSION_COOKIE_SAMESITE: "none" };
    const r = res();
    clearSessionCookie(r as never);
    expect(r.clearCookie).toHaveBeenCalledWith("zenora_session", { httpOnly: true, secure: true, sameSite: "none", path: "/" });
  });
});
