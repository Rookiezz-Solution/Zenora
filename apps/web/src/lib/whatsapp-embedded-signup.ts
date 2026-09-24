// WhatsApp Embedded Signup: loads the Facebook JS SDK, opens the signup
// popup, and listens for the `WA_EMBEDDED_SIGNUP` postMessage Meta sends
// with the new WABA/phone number ids (the OAuth `code` alone doesn't carry
// them — see docs/INTEGRATIONS.md).
export interface EmbeddedSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; version: string; xfbml?: boolean }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        params: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, version: "v21.0", xfbml: false });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

export async function startWhatsappEmbeddedSignup(): Promise<EmbeddedSignupResult> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID;
  if (!appId || !configId) {
    throw new Error("WhatsApp connect isn't configured yet — set NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID");
  }

  await loadFacebookSdk(appId);

  return new Promise((resolve, reject) => {
    let sessionData: { wabaId?: string; phoneNumberId?: string } = {};

    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          sessionData = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        }
      } catch {
        // Not a JSON message we care about.
      }
    }
    window.addEventListener("message", onMessage);

    window.FB!.login(
      (response) => {
        window.removeEventListener("message", onMessage);
        const code = response.authResponse?.code;
        if (!code || !sessionData.wabaId || !sessionData.phoneNumberId) {
          reject(new Error("WhatsApp signup was cancelled or didn't return the expected data"));
          return;
        }
        resolve({ code, wabaId: sessionData.wabaId, phoneNumberId: sessionData.phoneNumberId });
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" }
      }
    );
  });
}
