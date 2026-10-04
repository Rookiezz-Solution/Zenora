// "Where to go after signing in", carried as ?next=/some/path. Only a path on
// this site is accepted ("/x", never "//x", "/\x" or "https://..."), so a crafted
// link cannot send a signed-in person to another website.
export function safeNext(search: string): string | null {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  // Control characters (a tab or newline can turn "/\t/evil.com" into "//evil.com" in some browsers).
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  return next;
}

export function withNext(href: string, next: string | null): string {
  return next ? `${href}?next=${encodeURIComponent(next)}` : href;
}
