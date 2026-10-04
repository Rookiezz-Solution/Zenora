/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Content-Security-Policy. Next.js needs inline scripts to hydrate (a nonce-based
// policy would force every page to render per request), so script-src allows
// 'unsafe-inline'; the value of this policy is everything else: no plugins, no
// other base URL, no framing, forms only post to us, and scripts, frames and
// network calls may only reach the places the app really uses.
//  - Razorpay checkout (script, payment frame, its telemetry);
//  - Meta's JS SDK for the WhatsApp/Instagram connect popups;
//  - our own API.
// Set CSP_REPORT_ONLY=true to log violations in the browser console instead of
// blocking, e.g. if a new third-party widget is added and needs checking first.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiUrl} https://api.razorpay.com https://lumberjack.razorpay.com https://graph.facebook.com https://www.facebook.com${isDev ? " ws://localhost:3000" : ""}`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.facebook.com https://web.facebook.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

const securityHeaders = [
  { key: process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing in Zenora is meant to be embedded in another site.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }])
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@zenora/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
