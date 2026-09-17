import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/assetlinks";

// Digital Asset Links for the Android (Trusted Web Activity) app. Public, no auth (Android's
// verifier is anonymous), identical on the main host and every customer subdomain. Configured by
// ANDROID_ASSETLINKS_SHA256 (Play App Signing certificate fingerprint(s), comma-separated) and
// optionally ANDROID_PACKAGE_NAME. Unconfigured → 404, so a half-set-up deployment never serves an
// empty statement that Android would cache as "not verified".
export const dynamic = "force-dynamic";

export function GET() {
  const body = buildAssetLinks(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_ASSETLINKS_SHA256);
  if (!body) return NextResponse.json({ error: "Not configured." }, { status: 404 });
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      // Android fetches this at install/first launch and re-checks periodically; an hour is plenty.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
