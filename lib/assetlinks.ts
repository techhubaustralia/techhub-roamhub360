// Digital Asset Links for the Android app (Trusted Web Activity). Pure + unit-tested; the route at
// /.well-known/assetlinks.json serves what this builds. Android verifies the statement on EVERY
// origin the app opens (app.roamhub360.com and each customer subdomain), so the same statement is
// served on all of them — one env config, every workspace.

export const DEFAULT_ANDROID_PACKAGE = "com.techhubaustralia.roamhub360";

// SHA-256 certificate fingerprint as Play App Signing / keytool print it: 32 colon-separated hex pairs.
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/** Parse a comma/whitespace-separated list of fingerprints; normalises case, drops anything malformed. */
export function parseFingerprints(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    const fp = part.trim().toUpperCase();
    if (fp && FINGERPRINT_RE.test(fp) && !out.includes(fp)) out.push(fp);
  }
  return out;
}

export function validPackageName(pkg: string): boolean {
  return PACKAGE_RE.test(pkg);
}

export interface AssetLinkStatement {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}

/** The assetlinks.json body, or null when nothing is configured (route answers 404). */
export function buildAssetLinks(pkg: string | undefined | null, fingerprintsRaw: string | undefined | null): AssetLinkStatement[] | null {
  const package_name = (pkg ?? "").trim() || DEFAULT_ANDROID_PACKAGE;
  const fps = parseFingerprints(fingerprintsRaw);
  if (!fps.length || !validPackageName(package_name)) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name, sha256_cert_fingerprints: fps },
    },
  ];
}
