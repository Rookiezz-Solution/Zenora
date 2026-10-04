import { ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));
vi.mock("nodemailer", () => ({ createTransport }));

const env = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../config/env", () => ({ loadEnv: () => env.current }));

import { Mailer } from "./mailer.service";

beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockResolvedValue({ messageId: "m1" });
  env.current = { SMTP_HOST: "smtp.example.com", SMTP_PORT: 587, SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "Zenora <no-reply@example.com>" };
});

const msg = { to: "ravi@x.co", subject: "Hello", text: "Body" };

describe("Mailer", () => {
  it("is configured only when a server and a from address are set", () => {
    const m = new Mailer();
    expect(m.isConfigured()).toBe(true);
    env.current = { SMTP_HOST: "smtp.example.com" };
    expect(m.isConfigured()).toBe(false);
    env.current = {};
    expect(m.isConfigured()).toBe(false);
  });

  it("sends through the configured server with the from address", async () => {
    await new Mailer().send(msg);
    expect(createTransport.mock.calls[0]![0]).toMatchObject({ host: "smtp.example.com", port: 587, secure: false, auth: { user: "u", pass: "p" } });
    expect(sendMail).toHaveBeenCalledWith({ from: "Zenora <no-reply@example.com>", to: "ravi@x.co", subject: "Hello", text: "Body" });
  });

  it("uses SSL from the start on port 465 unless told otherwise", async () => {
    env.current = { ...env.current, SMTP_PORT: 465 };
    await new Mailer().send(msg);
    expect(createTransport.mock.calls[0]![0]).toMatchObject({ port: 465, secure: true });
    env.current = { ...env.current, SMTP_PORT: 465, SMTP_SECURE: "false" };
    await new Mailer().send(msg);
    expect(createTransport.mock.calls[1]![0]).toMatchObject({ secure: false });
  });

  it("defaults to port 587 and sends without authentication when there is no username", async () => {
    env.current = { SMTP_HOST: "relay.internal", SMTP_FROM: "a@b.co" };
    await new Mailer().send(msg);
    expect(createTransport.mock.calls[0]![0]).toMatchObject({ port: 587, auth: undefined });
  });

  it("reuses the connection while the settings are unchanged and rebuilds it when they change", async () => {
    const m = new Mailer();
    await m.send(msg);
    await m.send(msg);
    expect(createTransport).toHaveBeenCalledTimes(1);
    env.current = { ...env.current, SMTP_PASS: "rotated" };
    await m.send(msg);
    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  it("refuses when email is not set up", async () => {
    env.current = {};
    await expect(new Mailer().send(msg)).rejects.toThrow(ServiceUnavailableException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("hides the transport's reason from the caller when sending fails", async () => {
    sendMail.mockRejectedValue(new Error("535 Authentication failed for user u"));
    const err = await new Mailer().send(msg).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(String(err.message)).not.toContain("535");
    expect(String(err.message)).not.toContain("Authentication");
  });
});
