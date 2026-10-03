import { prisma } from "@zenora/db";
import { WEBHOOK_MAX_ATTEMPTS, WEBHOOK_RETRY_DELAYS_MS, checkWebhookUrl } from "@zenora/shared";
import { createHmac } from "node:crypto";
import { decryptToken } from "../decrypt-token";
import { UnsafeTargetError, postWebhook } from "../webhooks/http";
import { enqueueWebhookDelivery } from "../webhooks/queue";

// What a customer's server uses to verify a delivery:
//   X-Zenora-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the secret>
export function signWebhookBody(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

// One delivery attempt. Retries are scheduled here (a delayed re-enqueue, like
// the sequence engine) rather than via BullMQ's attempts so every try is
// recorded on the delivery row the owner can see.
export async function processWebhookDelivery(deliveryId: string, now: Date = new Date()): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!delivery || delivery.status === "delivered" || delivery.status === "failed") return;

  const fail = (error: string) => prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "failed", error, attempts: delivery.attempts + 1 } });

  const { endpoint } = delivery;
  if (!endpoint.active) {
    await fail("The endpoint is disabled");
    return;
  }

  const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE === "true";
  const urlCheck = checkWebhookUrl(endpoint.url, { allowPrivate });
  if (!urlCheck.ok) {
    await fail(urlCheck.reason);
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(now.getTime() / 1000);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Zenora-Webhooks/1.0",
    "X-Zenora-Event": delivery.event,
    "X-Zenora-Delivery": delivery.id,
    "X-Zenora-Signature": signWebhookBody(decryptToken(endpoint.secretCipher), timestamp, body)
  };

  const attempts = delivery.attempts + 1;
  try {
    const res = await postWebhook(urlCheck.url, headers, body, { allowPrivate });
    if (res.status >= 200 && res.status < 300) {
      await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "delivered", attempts, responseStatus: res.status, error: null, deliveredAt: now } });
      return;
    }
    await retryOrFail(deliveryId, attempts, `The endpoint answered HTTP ${res.status}`, res.status);
  } catch (err) {
    if (err instanceof UnsafeTargetError) {
      // Never retried: the address won't become public by waiting.
      await fail(err.message);
      return;
    }
    await retryOrFail(deliveryId, attempts, err instanceof Error ? err.message.slice(0, 300) : "Request failed");
  }
}

async function retryOrFail(deliveryId: string, attempts: number, error: string, responseStatus?: number) {
  if (attempts >= WEBHOOK_MAX_ATTEMPTS) {
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "failed", attempts, error, responseStatus } });
    return;
  }
  await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "retrying", attempts, error, responseStatus } });
  await enqueueWebhookDelivery(deliveryId, WEBHOOK_RETRY_DELAYS_MS[attempts - 1]!);
}
