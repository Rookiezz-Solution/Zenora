import Link from "next/link";

// Password reset email/token flow ships with Phase 1's email service
// (INTEGRATIONS.md: AWS SES / ZeptoMail). Phase 0 wires OTP-based recovery
// instead, via /verify.
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Forgot password</h1>
      <p className="text-sm text-gray-500">
        Password reset emails aren&apos;t wired up yet. Use phone verification to sign in instead.
      </p>
      <Link href="/verify" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
        Verify with phone
      </Link>
      <Link href="/login" className="text-sm text-gray-500">
        Back to log in
      </Link>
    </main>
  );
}
