import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = { title: `Terms · ${brand.productName}` };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of use">
      <p>These terms summarise acceptable use of {brand.productName}, operated by {brand.company}. A signed order form or master services agreement governs any paid deployment and prevails over this summary.</p>

      <h2>Subscription</h2>
      <p>{brand.productName} is licensed per <b>site</b> (a building or location). Your plan sets how many sites and floors-per-site you may configure; these limits are enforced by the service. When a licence expires, the workspace becomes read-only until it is renewed.</p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use the service only for your organisation&apos;s legitimate workspace-management purposes.</li>
        <li>Keep your credentials secure; you are responsible for activity under your account.</li>
        <li>Do not attempt to access another organisation&apos;s tenant or circumvent licence limits.</li>
      </ul>

      <h2>Availability &amp; support</h2>
      <p>We aim for high availability and support paid customers via {brand.company}. The service is provided without warranty except as set out in your agreement.</p>

      <h2>Changes</h2>
      <p>We may update these terms; material changes will be communicated to administrators.</p>

      <p className="mt-8"><Link href="/signin" className="font-semibold text-primary">← Back to sign in</Link></p>
    </LegalShell>
  );
}
