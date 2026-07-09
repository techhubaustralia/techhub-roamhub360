import "server-only";
import Stripe from "stripe";
import { saveLicense } from "./licensing";
import { audit } from "./db";

// Billing (Commercial SaaS CP4) — real Stripe integration, gated by env. When BILLING_PROVIDER=stripe
// and the Stripe keys are set, workspaces can subscribe via Checkout and the webhook keeps their
// licence in sync (active on payment, suspended on cancellation). Otherwise it's an inert stub and
// licences stay operator-managed in the Partner portal.

export type BillingProviderId = "none" | "stripe" | "marketplace" | "xero" | "myob";

const PROVIDER = (process.env.BILLING_PROVIDER || "none") as BillingProviderId;
const KEY = process.env.STRIPE_SECRET_KEY?.trim();
const PRICE = process.env.STRIPE_PRICE_ID?.trim();
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim();

export const billingConfigured = PROVIDER === "stripe" && Boolean(KEY && PRICE);

let _stripe: Stripe | null = null;
function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(KEY as string);
  return _stripe;
}

export function billingStatus(): { provider: BillingProviderId; configured: boolean } {
  return { provider: PROVIDER, configured: billingConfigured };
}

/** Create a Stripe Checkout session for a workspace subscription. Returns the redirect URL. */
export async function createCheckout(opts: { slug: string; email?: string; quantity?: number; origin: string }): Promise<string | null> {
  if (!billingConfigured) return null;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: PRICE as string, quantity: Math.max(1, opts.quantity ?? 1) }],
    customer_email: opts.email,
    client_reference_id: opts.slug,
    subscription_data: { metadata: { workspace: opts.slug } },
    metadata: { workspace: opts.slug },
    success_url: `${opts.origin}/admin/license?billing=success`,
    cancel_url: `${opts.origin}/admin/license?billing=cancelled`,
  });
  return session.url;
}

// Active for ~1 year + a month of grace after each successful payment; renewals push it out again.
const yearOut = () => new Date(Date.now() + 397 * 86_400_000).toISOString();

/** Verify + process a Stripe webhook. Activates/suspends the workspace licence. */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!billingConfigured || !WEBHOOK_SECRET) return { ok: false, error: "billing not configured" };
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature ?? "", WEBHOOK_SECRET);
  } catch {
    return { ok: false, error: "invalid signature" };
  }

  const activate = async (slug: string, reason: string) => {
    await saveLicense(slug, { status: "active", expiresAt: yearOut() });
    await audit("stripe", "billing.activate", `${slug} (${reason})`);
  };

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const slug = (s.metadata?.workspace || s.client_reference_id) as string | undefined;
      if (slug) await activate(slug, "checkout");
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const inv = event.data.object as unknown as { subscription?: string };
      if (inv.subscription) {
        const sub = await stripe().subscriptions.retrieve(inv.subscription);
        const slug = sub.metadata?.workspace;
        if (slug) await activate(slug, "renewal");
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const slug = sub.metadata?.workspace;
      if (slug) {
        await saveLicense(slug, { status: "suspended" });
        await audit("stripe", "billing.cancel", slug);
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "handler error" };
  }
  return { ok: true };
}
