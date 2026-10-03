import { REFERRAL_ATTRIBUTION_DAYS, isReferralFresh, normalizeReferralCode } from "@zenora/shared";

const STORAGE_KEY = "zenora.referral";

// A visitor arriving through a referral link: remember the code (for the
// attribution window) until they create a workspace.
export function captureReferral(rawCode: string): boolean {
  const code = normalizeReferralCode(rawCode);
  if (!code) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

// The remembered code if it is still inside the attribution window.
export function pendingReferral(): string | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    return isReferralFresh(at, Date.now(), REFERRAL_ATTRIBUTION_DAYS) ? code : undefined;
  } catch {
    return undefined;
  }
}

export function clearReferral() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}
