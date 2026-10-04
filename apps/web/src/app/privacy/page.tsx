import type { Metadata } from "next";
import { LEGAL_ENTITY, LegalLayout, SUPPORT_EMAIL } from "@/components/legal-layout";

export const metadata: Metadata = { title: "Privacy policy · Zenora" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy">
      <p>
        Zenora is a customer-relationship tool run by {LEGAL_ENTITY} (&ldquo;we&rdquo;). Businesses use it to manage conversations and leads from Instagram, WhatsApp and other channels. This page explains what we collect, why, who sees it, and the choices you have.
      </p>

      <h2>Two kinds of people, two roles</h2>
      <p>
        <strong>Our customers</strong> (the businesses and agencies that sign up) are the owners of the contact and conversation data they put into Zenora. For that data, the customer decides why and how it is used and we process it on their behalf. <strong>Their contacts</strong> (leads and customers who message a business) should contact the business first for any request about their data; we will help the business answer it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong>: name, email, optional phone number, a hashed password (we never store the password itself), and sign-in method.
        </li>
        <li>
          <strong>Workspace data our customers add or receive</strong>: contacts and their phone numbers, emails and handles; conversations and messages; notes, tags, tasks, bookings, consent records, automations and templates.
        </li>
        <li>
          <strong>Billing details</strong>: business name, GSTIN, address, and invoices. Card and bank details are handled by our payment provider and never reach us.
        </li>
        <li>
          <strong>Technical data</strong>: sign-in times, IP addresses for security and abuse protection, and logs of administrative actions.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide Zenora: receive and send messages, run automations, book appointments, report results.</li>
        <li>To keep it secure, prevent abuse, and fix problems.</li>
        <li>To bill and to meet tax and legal obligations.</li>
        <li>To provide AI features. Only when a customer turns them on, relevant message text and the business&apos;s own knowledge base are sent to our AI provider to draft or score replies.</li>
      </ul>
      <p>We do not sell personal data and we do not use customers&apos; contact data for advertising.</p>

      <h2>Who else handles it</h2>
      <p>We use these services to run Zenora. Each receives only what it needs:</p>
      <ul>
        <li>Meta (Instagram and WhatsApp), to send and receive messages and read ad results, when a customer connects them.</li>
        <li>Google (sign-in and Calendar), when a customer or team member connects them.</li>
        <li>Razorpay, for payments.</li>
        <li>Anthropic, for AI features, when used.</li>
        <li>Our hosting and database providers, which store the data in encrypted form.</li>
      </ul>
      <p>Customers can also choose to send data to their own systems through API keys and webhooks, and to download customer lists for their own advertising. Those are the customer&apos;s decisions and responsibility.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Customers choose how long messages are kept (or keep them until deleted). Raw channel payloads and webhook logs are removed after 30 days.</li>
        <li>When a workspace is deleted, everything about its contacts and conversations is removed after a 7-day grace period. Invoices are kept for 8 years because tax rules require it; they contain business billing details only.</li>
        <li>When you delete your account your login and memberships are removed.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Download a copy of a workspace&apos;s data, or of one contact&apos;s data, from Settings → Privacy.</li>
        <li>Erase one contact permanently, delete a workspace, or delete your account, from the same page.</li>
        <li>Record or withdraw a contact&apos;s marketing consent at any time; customer lists and broadcasts honour the latest choice.</li>
        <li>Ask us to correct or delete personal data, or raise a complaint, using the contact below.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Access tokens and integration secrets are encrypted at rest, passwords are hashed, access to each workspace is separated and checked on every request, and administrative actions are logged. No system is perfectly secure; if a breach affects your data we will tell you as the law requires.
      </p>

      <h2>Cookies</h2>
      <p>We use one essential cookie to keep you signed in and short-lived cookies during sign-in with Facebook or Google. We do not use advertising or tracking cookies.</p>

      <h2>Contact</h2>
      <p>{SUPPORT_EMAIL ? <>Write to <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.</> : <>Contact your Zenora account manager or the support address shown on your invoice.</>}</p>
    </LegalLayout>
  );
}
