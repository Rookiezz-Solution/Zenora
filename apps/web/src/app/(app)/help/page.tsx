import Link from "next/link";
import { SUPPORT_EMAIL } from "@/components/legal-layout";

export const metadata = { title: "Help · Zenora" };

const STEPS: { title: string; body: string; href: string; cta: string }[] = [
  { title: "Connect your channels", body: "Link your Instagram account and WhatsApp number. You connect your own accounts, using Meta's official login.", href: "/settings", cta: "Connect channels" },
  { title: "Turn on a starter automation", body: "Pick a ready-made flow for your kind of business, check the wording, and publish it.", href: "/automations/templates", cta: "Browse templates" },
  { title: "Teach the AI your business", body: "Add your website, price list and FAQs so replies are accurate. Nothing is sent without the rules you set.", href: "/settings/knowledge", cta: "Add knowledge" },
  { title: "Invite your team and set routing", body: "New leads go to the right person, and a reply timer reassigns anything left waiting.", href: "/settings/routing", cta: "Set routing" },
  { title: "Share your booking page or link in bio", body: "Let people book a time or ask for a call-back without messaging first.", href: "/calendar", cta: "Set up bookings" }
];

const FAQ: { q: string; a: string }[] = [
  { q: "Why can't I message someone on WhatsApp?", a: "WhatsApp only lets you send free-form messages for 24 hours after a customer last wrote to you. After that you can only send an approved template. Create one under Broadcasts and templates, and wait for Meta's approval." },
  { q: "What are AI credits?", a: "A credit is used each time an AI feature runs, such as a suggested reply or a lead score. Your balance and monthly allowance are on Home. If they run out, AI features pause and everything else keeps working. You can top up under Settings → Billing and plan." },
  { q: "Who pays WhatsApp's message charges?", a: "Meta bills you directly for WhatsApp conversations. Zenora shows an estimate for each broadcast before you send it." },
  { q: "How do I add my team?", a: "Settings → Team shows your members and pending invitations, and lets you invite, change roles and remove people. Owners control billing and the workspace, admins manage settings and people, and managers and sales staff work with leads. Plans include a number of seats; extra seats can be added." },
  { q: "Can I manage several businesses?", a: "Yes. The Agency page lets you create or link client workspaces and switch between them. Each client keeps its own data and billing, and can remove your access at any time." },
  { q: "How do I connect Zenora to my other tools?", a: "Settings → Developers has API keys (read and create leads) and webhooks (a signed message to your server when a lead is created, moves stage, or a booking is made)." },
  { q: "How do I get my data out, or delete someone's?", a: "Settings → Privacy lets owners download everything, download or erase one person's data, set how long messages are kept, and delete the workspace (after a 7-day cancellable grace period)." },
  { q: "Who can see my customers' data?", a: "Only people in your workspace, and agency staff only if you have linked an agency. Zenora's own team does not browse workspaces; platform administrators see usage and billing figures, not conversations." },
  { q: "I forgot my password.", a: "Choose Forgot password on the sign-in page and sign in with an emailed code or with Google instead." }
];

export default function HelpPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Help and support</h1>
      <p className="mt-1 text-sm text-gray-500">Get set up in an afternoon, and find quick answers.</p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">Getting started</h2>
        <ol className="mt-3 space-y-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-md border border-gray-200 bg-white p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{s.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{s.body}</p>
              </div>
              <Link href={s.href} className="self-center whitespace-nowrap text-xs font-medium text-brand-700 underline">
                {s.cta}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Common questions</h2>
        <div className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-gray-900">{f.q}</summary>
              <p className="mt-2 text-sm text-gray-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Still stuck?</h2>
        <p className="mt-1 text-sm text-gray-600">
          {SUPPORT_EMAIL ? (
            <>
              Email <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 underline">{SUPPORT_EMAIL}</a> and tell us what you were doing and what you saw. Screenshots help.
            </>
          ) : (
            <>Contact your Zenora account manager, and tell them what you were doing and what you saw. Screenshots help.</>
          )}
        </p>
        <p className="mt-3 text-xs text-gray-400">
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </section>
    </div>
  );
}
