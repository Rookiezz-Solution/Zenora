// Consent and customer-list rules (docs/ROADMAP.md Phase 2: audience sync).

export interface ConsentRecord {
  type: string;
  granted: boolean;
  createdAt: Date | string;
}

// Consent is a history, not a flag: someone who agreed in March and withdrew in
// May has NOT consented. The most recent record of that type decides, and no
// record at all means no consent.
export function hasActiveConsent(records: ConsentRecord[], type: string): boolean {
  let latest: ConsentRecord | undefined;
  for (const r of records) {
    if (r.type !== type) continue;
    if (!latest || new Date(r.createdAt).getTime() >= new Date(latest.createdAt).getTime()) latest = r;
  }
  return latest?.granted === true;
}

// Meta matches customer lists on a phone number written as digits only,
// including the country code, then SHA-256 hashed. A 10-digit number with no
// country code is completed with the workspace's default (91 for India);
// anything else is passed through as stored.
export function phoneForAudience(phone: string, defaultCountryCode: string | null): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.length === 10 && defaultCountryCode) return `${defaultCountryCode}${digits}`;
  return digits;
}

export function defaultCountryCodeForTimezone(timezone: string): string | null {
  return timezone === "Asia/Kolkata" || timezone === "Asia/Calcutta" ? "91" : null;
}
