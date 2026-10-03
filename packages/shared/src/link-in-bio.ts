// The exact sentence shown beside the call-back form's tick box. The API
// serves it to the public page and stores it with each consent record, so
// what a visitor agreed to is always what was on screen.
export const LINK_IN_BIO_CONSENT_TEXT = "I agree to be contacted about my enquiry.";

export const LINK_IN_BIO_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

// Digits only, 8-15 long (E.164 allows 15). A leading + and common
// separators are tolerated on input.
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-()+]/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
