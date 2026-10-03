import { apiFetch } from "./api";

export interface PublicConfig {
  metaAppId: string | null;
  metaWhatsappConfigId: string | null;
  razorpayKeyId: string | null;
}

// Ids the browser needs to start Meta/Razorpay flows, set by the super admin
// in the dashboard. Falls back to the old build-time NEXT_PUBLIC_* variables
// so existing deployments keep working.
export async function getPublicConfig(): Promise<PublicConfig> {
  const fromApi = await apiFetch<PublicConfig>("/public/config").catch(() => null);
  return {
    metaAppId: fromApi?.metaAppId || process.env.NEXT_PUBLIC_META_APP_ID || null,
    metaWhatsappConfigId: fromApi?.metaWhatsappConfigId || process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID || null,
    razorpayKeyId: fromApi?.razorpayKeyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null
  };
}
