import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ webhookDelivery: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../decrypt-token", () => ({ decryptToken: (v: string) => v.replace(/^enc\(|\)$/g, "") }));
const postWebhook = vi.hoisted(() => vi.fn());
vi.mock("../webhooks/http", () => ({
  postWebhook,
  UnsafeTargetError: class UnsafeTargetError extends Error {}
}));
const enqueueWebhookDelivery = vi.hoisted(() => vi.fn());
vi.mock("../webhooks/queue", () => ({ enqueueWebhookDelivery }));

import { UnsafeTargetError } from "../webhooks/http";
import { processWebhookDelivery, signWebhookBody } from "./webhook-delivery";

const now = new Date("2026-10-06T10:00:00Z");

function delivery(overrides: Record<string, unknown> = {}, endpoint: Record<string, unknown> = {}) {
  return {
    id: "d1",
    event: "lead.created",
    status: "pending",
    attempts: 0,
    payload: { id: "d1", event: "lead.created", data: { id: "l1" } },
    endpoint: { url: "https://hooks.example.com/z", secretCipher: "enc(whsec_secret)", active: true, ...endpoint },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
  prismaMock.webhookDelivery.findUnique.mockResolvedValue(delivery());
  postWebhook.mockResolvedValue({ status: 200 });
});

describe("signWebhookBody", () => {
  it("is an HMAC-SHA256 over timestamp.body that a receiver can recompute", () => {
    const expected = createHmac("sha256", "whsec_secret").update('1790000000.{"a":1}').digest("hex");
    expect(signWebhookBody("whsec_secret", 1790000000, '{"a":1}')).toBe(`t=1790000000,v1=${expected}`);
  });
});

describe("processWebhookDelivery", () => {
  it("POSTs the signed payload with identifying headers and marks it delivered", async () => {
    await processWebhookDelivery("d1", now);

    const [url, headers, body] = postWebhook.mock.calls[0]!;
    expect(url).toBe("https://hooks.example.com/z");
    expect(JSON.parse(body)).toMatchObject({ event: "lead.created", data: { id: "l1" } });
    expect(headers["X-Zenora-Event"]).toBe("lead.created");
    expect(headers["X-Zenora-Delivery"]).toBe("d1");
    expect(headers["X-Zenora-Signature"]).toBe(signWebhookBody("whsec_secret", Math.floor(now.getTime() / 1000), body));
    expect(prismaMock.webhookDelivery.update.mock.calls[0]![0].data).toMatchObject({ status: "delivered", attempts: 1, responseStatus: 200 });
    expect(enqueueWebhookDelivery).not.toHaveBeenCalled();
  });

  it("does nothing for a delivery that is already finished or gone", async () => {
    prismaMock.webhookDelivery.findUnique.mockResolvedValue(delivery({ status: "delivered" }));
    await processWebhookDelivery("d1", now);
    prismaMock.webhookDelivery.findUnique.mockResolvedValue(null);
    await processWebhookDelivery("d1", now);
    expect(postWebhook).not.toHaveBeenCalled();
  });

  it("schedules a retry with backoff after a non-2xx answer", async () => {
    postWebhook.mockResolvedValue({ status: 500 });
    await processWebhookDelivery("d1", now);

    expect(prismaMock.webhookDelivery.update.mock.calls[0]![0].data).toMatchObject({ status: "retrying", attempts: 1, responseStatus: 500, error: "The endpoint answered HTTP 500" });
    expect(enqueueWebhookDelivery).toHaveBeenCalledWith("d1", 60_000);
  });

  it("backs off further on later attempts and gives up after the sixth", async () => {
    postWebhook.mockRejectedValue(new Error("ECONNRESET"));
    prismaMock.webhookDelivery.findUnique.mockResolvedValue(delivery({ attempts: 2 }));
    await processWebhookDelivery("d1", now);
    expect(enqueueWebhookDelivery).toHaveBeenCalledWith("d1", 30 * 60_000);

    vi.clearAllMocks();
    prismaMock.webhookDelivery.findUnique.mockResolvedValue(delivery({ attempts: 5 }));
    await processWebhookDelivery("d1", now);
    expect(prismaMock.webhookDelivery.update.mock.calls[0]![0].data).toMatchObject({ status: "failed", attempts: 6, error: "ECONNRESET" });
    expect(enqueueWebhookDelivery).not.toHaveBeenCalled();
  });

  it("fails a disabled endpoint without calling it", async () => {
    prismaMock.webhookDelivery.findUnique.mockResolvedValue(delivery({}, { active: false }));
    await processWebhookDelivery("d1", now);
    expect(postWebhook).not.toHaveBeenCalled();
    expect(prismaMock.webhookDelivery.update.mock.calls[0]![0].data).toMatchObject({ status: "failed" });
  });

  it("never calls, and never retries, a URL that points at a private address", async () => {
    prismaMock.webhookDelivery.findUnique.mockResolvedValue(delivery({}, { url: "https://169.254.169.254/latest" }));
    await processWebhookDelivery("d1", now);
    expect(postWebhook).not.toHaveBeenCalled();
    expect(prismaMock.webhookDelivery.update.mock.calls[0]![0].data.status).toBe("failed");
    expect(enqueueWebhookDelivery).not.toHaveBeenCalled();
  });

  it("fails permanently, without retries, if the host resolves to a private address", async () => {
    postWebhook.mockRejectedValue(new UnsafeTargetError("The host resolves to a private or internal address"));
    await processWebhookDelivery("d1", now);
    expect(prismaMock.webhookDelivery.update.mock.calls[0]![0].data).toMatchObject({ status: "failed", error: "The host resolves to a private or internal address" });
    expect(enqueueWebhookDelivery).not.toHaveBeenCalled();
  });
});
