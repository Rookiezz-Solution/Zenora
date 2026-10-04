"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";

const input = "rounded-md border border-gray-300 px-3 py-2 text-sm";

// Two steps: ask for a code by email, then enter it with a new password. The
// answer to step one is the same whether or not the address has an account.
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/otp/request", { method: "POST", body: JSON.stringify({ target: email.trim(), purpose: "password_reset" }) });
      setStep("code");
    } catch (err) {
      setError((err as ApiError).message ?? "Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/password/reset", { method: "POST", body: JSON.stringify({ email: email.trim(), code: code.trim(), newPassword: password }) });
      router.push("/dashboard");
    } catch (err) {
      setError((err as ApiError).message ?? "Could not reset the password. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-center text-2xl font-semibold text-gray-900">Forgot password</h1>

      {step === "email" ? (
        <form onSubmit={requestCode} className="flex flex-col gap-3">
          <p className="text-center text-sm text-gray-500">Enter your account email and we will send you a 6-digit code.</p>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={input} />
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={reset} className="flex flex-col gap-3">
          <p className="text-center text-sm text-gray-500">
            If <span className="font-medium text-gray-700">{email}</span> has an account, a code is on its way. It works for 10 minutes.
          </p>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className={`${input} tracking-widest`} />
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (at least 8 characters)" className={input} />
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={busy || code.length !== 6} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Set new password and sign in"}
          </button>
          <button type="button" onClick={() => { setStep("email"); setError(null); }} className="text-sm text-gray-500 underline">
            Use a different email, or send the code again
          </button>
        </form>
      )}

      <p className="text-center text-sm text-gray-500">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </main>
  );
}
