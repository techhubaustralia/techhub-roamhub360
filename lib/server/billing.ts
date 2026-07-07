import "server-only";

// Billing-readiness (Commercial SaaS CP4) — ARCHITECTURE ONLY. A pluggable provider seam so a
// real integration (Stripe, Microsoft commercial marketplace, Xero, MYOB) can be dropped in later
// without touching callers. Today every provider is an unconfigured stub: the licence is the
// source of truth (issued/edited in the Partner portal), and billing is reconciled out-of-band.

export type BillingProviderId = "none" | "stripe" | "marketplace" | "xero" | "myob";

export interface BillingProvider {
  id: BillingProviderId;
  configured: boolean;
  // Future surface (no-ops today). A real provider would create/sync a subscription against a
  // tenant's licence, open a customer billing portal, and reconcile invoices.
  checkoutUrl?(tenantId: string): Promise<string | null>;
  portalUrl?(tenantId: string): Promise<string | null>;
}

/** Resolve the configured provider. Returns an unconfigured stub until a real one is implemented. */
export function billingProvider(): BillingProvider {
  const id = (process.env.BILLING_PROVIDER || "none") as BillingProviderId;
  return { id: (["none", "stripe", "marketplace", "xero", "myob"] as BillingProviderId[]).includes(id) ? id : "none", configured: false };
}

export function billingStatus(): { provider: BillingProviderId; configured: boolean } {
  const p = billingProvider();
  return { provider: p.id, configured: p.configured };
}
