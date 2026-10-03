import { getPublicConfig } from "./public-config";
// Razorpay Checkout.js — loads the widget script once, opens the payment
// modal for an order the API already created, and resolves with the three
// ids the API's /billing/:workspaceId/confirm endpoint needs to verify and
// apply the payment. Structurally complete; only exercisable end-to-end
// once NEXT_PUBLIC_RAZORPAY_KEY_ID / real Razorpay keys exist (see
// docs/PROGRESS.md Phase 1 item 9).
export interface RazorpayPaymentResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadCheckoutJs(): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the Razorpay checkout script"));
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

export async function openRazorpayCheckout(params: {
  orderId: string;
  amountInr: number;
  description: string;
  name?: string;
  email?: string;
}): Promise<RazorpayPaymentResult> {
  const keyId = (await getPublicConfig()).razorpayKeyId;
  if (!keyId) {
    throw new Error("Payments aren't configured yet — ask your platform admin to add the Razorpay key in the admin dashboard");
  }
  await loadCheckoutJs();

  return new Promise((resolve, reject) => {
    const razorpay = new window.Razorpay!({
      key: keyId,
      order_id: params.orderId,
      amount: Math.round(params.amountInr * 100),
      currency: "INR",
      name: "Zenora",
      description: params.description,
      prefill: { name: params.name, email: params.email },
      handler: (response: RazorpayPaymentResult) => resolve(response),
      modal: { ondismiss: () => reject(new Error("Payment was cancelled")) }
    });
    razorpay.open();
  });
}
