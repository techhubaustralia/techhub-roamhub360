import type { Metadata } from "next";
import { SignInForm } from "@/components/signin-form";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: `Sign in · ${brand.productName}` };

// Public page (allowed in auth.config). Full-screen — covers the app chrome behind it.
export default function SignInPage() {
  const entraEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);
  return <SignInForm entraEnabled={entraEnabled} googleEnabled={googleEnabled} />;
}
