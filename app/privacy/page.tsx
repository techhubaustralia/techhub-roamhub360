import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = { title: `Privacy · ${brand.productName}` };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <p>{brand.productName} is a workspace-booking platform operated by {brand.company}. This summary explains what we process and why. It is not a substitute for a signed data-processing agreement, which governs any paid deployment.</p>

      <h2>What we process</h2>
      <ul>
        <li><b>Account &amp; identity:</b> your name and email (from Microsoft/Google sign-in or a local account), and your role.</li>
        <li><b>Bookings &amp; presence:</b> the spaces you reserve and your check-in status, used to run bookings and the &ldquo;Who&apos;s in&rdquo; board.</li>
        <li><b>Directory data:</b> if your organisation connects Microsoft 365, we cache names, titles, departments, managers and photos to show real profiles.</li>
      </ul>

      <h2>How it&apos;s isolated</h2>
      <p>Each organisation is a separate tenant. Your data is scoped to your organisation and is never shown to another. Microsoft credentials you provide are <b>encrypted at rest</b> and are never returned to a browser.</p>

      <h2>Visibility to colleagues</h2>
      <p>Colleagues in your organisation can see who is booked or checked in on a given day. You can hide yourself from that board at any time under <b>Settings</b>.</p>

      <h2>Retention &amp; contact</h2>
      <p>Data is retained for the life of your subscription and removed on request afterwards. For access, correction or deletion requests, contact your administrator or {brand.company}.</p>

      <p className="mt-8"><Link href="/signin" className="font-semibold text-primary">← Back to sign in</Link></p>
    </LegalShell>
  );
}
