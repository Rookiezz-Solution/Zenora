"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { captureReferral } from "@/lib/referral-capture";

// Public referral link (/r/CODE): remember who sent the visitor, then send them
// to sign up. An invalid code is ignored and they still land on sign-up.
export default function ReferralLandingPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    captureReferral(code);
    router.replace("/signup");
  }, [code, router]);

  return <p className="p-8 text-center text-sm text-gray-500">Taking you to sign up…</p>;
}
