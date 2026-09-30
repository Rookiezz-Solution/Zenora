import { BadRequestException, Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import { loadEnv } from "../config/env";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
  notes: Record<string, string>;
}

// Thin wrapper around Razorpay's Orders API — the checkout flow docs/PRD.md's
// `Checkout` screen needs (GST-inclusive amount, coupon deferred — see
// docs/PROGRESS.md's Phase 1 item 9 simplifications). Structurally complete;
// like every third-party integration in this repo it can't be live-tested
// without real RAZORPAY_KEY_ID/SECRET (CLAUDE.md: ask before adding a
// payment gateway — done, Razorpay was the explicit choice).
@Injectable()
export class RazorpayClient {
  private authHeader(): string {
    const env = loadEnv();
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      throw new BadRequestException("Payments aren't configured yet — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET");
    }
    return `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
  }

  // amountInr is the GST-inclusive total; Razorpay wants the smallest unit (paise).
  async createOrder(amountInr: number, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: "INR", receipt, notes })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Razorpay order creation failed: ${JSON.stringify(body)}`);
    }
    return body as RazorpayOrder;
  }

  // Used by the client-side checkout confirm path, which only gets back
  // {order_id, payment_id, signature} — the intent notes we stashed on the
  // order have to be re-fetched to know what was actually purchased.
  async getOrder(orderId: string): Promise<RazorpayOrder> {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { Authorization: this.authHeader() }
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Razorpay order lookup failed: ${JSON.stringify(body)}`);
    }
    return body as RazorpayOrder;
  }

  // HMAC-SHA256 of the raw webhook body, keyed with the webhook secret —
  // Razorpay's documented verification scheme.
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const env = loadEnv();
    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
    return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // Checkout.js (client-side) posts back { razorpay_order_id, razorpay_payment_id,
  // razorpay_signature }; this is the same HMAC scheme keyed with the API
  // secret (not the webhook secret) over `${orderId}|${paymentId}`.
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const env = loadEnv();
    if (!env.RAZORPAY_KEY_SECRET) return false;
    const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
