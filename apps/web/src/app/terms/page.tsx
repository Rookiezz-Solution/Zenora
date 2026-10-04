import type { Metadata } from "next";
import { LEGAL_ENTITY, LegalLayout, SUPPORT_EMAIL } from "@/components/legal-layout";

export const metadata: Metadata = { title: "Terms of service · Zenora" };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of service">
      <p>
        These terms are between you and {LEGAL_ENTITY} (&ldquo;we&rdquo;) and cover your use of Zenora. By creating an account you agree to them. If you use Zenora for a business, you confirm you can bind that business.
      </p>

      <h2>The service</h2>
      <p>
        Zenora helps businesses capture leads and handle conversations from Instagram, WhatsApp and similar channels, with automations, a sales pipeline, bookings and reports. Features and limits depend on your plan. We use only the channels&apos; official APIs, and some features need a connection to a third-party account you control.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in details safe and tell us if you think your account was accessed without permission.</li>
        <li>You are responsible for what happens under your account, including people you invite.</li>
        <li>Each workspace needs at least one owner. Agencies who manage a client&apos;s workspace do so with the client&apos;s agreement, and the client&apos;s owner can remove that access at any time.</li>
      </ul>

      <h2>What you must and must not do</h2>
      <ul>
        <li>Only message people who have agreed to hear from you, and follow WhatsApp, Instagram and Meta&apos;s own rules (including the 24-hour reply window and approved templates).</li>
        <li>Keep accurate consent records and honour withdrawals. Zenora gives you the tools; compliance is your responsibility.</li>
        <li>Do not send spam, unlawful, deceptive or abusive content, or use Zenora to harm anyone or break the law.</li>
        <li>Do not try to break, overload or reverse-engineer the service, or access another customer&apos;s data.</li>
        <li>Do not use the API or webhooks to reach systems you do not own or have permission to use.</li>
      </ul>
      <p>We may suspend an account that puts the service or other people at risk, and will explain why where we can.</p>

      <h2>Your data</h2>
      <p>
        You own the contacts, messages and other content you put into Zenora. You give us permission to process it only to run the service for you, as described in the <a href="/privacy" className="underline">privacy policy</a>. You can download it, and delete it, whenever you like.
      </p>

      <h2>Plans, payments and AI credits</h2>
      <ul>
        <li>Prices are shown before GST; 18% GST is added at checkout and shown on your invoice. A price change applies to purchases made after the change, not to ones you have already made.</li>
        <li>WhatsApp conversation charges are billed to you by Meta directly. Zenora shows estimates only.</li>
        <li>AI credits are used when AI features run. When they are used up, AI features pause and the rest of Zenora keeps working.</li>
        <li>Payments are not refunded unless the law requires it or we say otherwise in writing.</li>
      </ul>

      <h2>Referral programme</h2>
      <p>If you take part, commission is earned on what referred businesses pay us before GST, for a limited period, and is paid against your tax invoice. We may change or end the programme for new referrals, and may withhold commission obtained by self-referral or misuse.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep Zenora running but cannot promise it will always be available or error-free, and it depends on services we do not control, such as Meta, Google and payment networks. We may change features; we will give notice of changes that significantly reduce what you have paid for.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, we are not liable for indirect or consequential loss, or for loss caused by third-party services, and our total liability for any claim is limited to what you paid us in the 12 months before it. Nothing here limits liability that cannot lawfully be limited.</p>

      <h2>Ending</h2>
      <p>You can stop at any time and delete your workspace and account from Settings → Privacy. We keep invoices for the period tax law requires. These terms are governed by the laws of India, with the courts at our registered office having jurisdiction.</p>

      <h2>Contact</h2>
      <p>{SUPPORT_EMAIL ? <>Write to <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.</> : <>Contact your Zenora account manager or the support address shown on your invoice.</>}</p>
    </LegalLayout>
  );
}
