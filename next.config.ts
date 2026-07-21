import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone server bundle for the container image (Azure Container Apps)
  output: "standalone",
  // There is no CDN/Front Door in front of the custom domain, and the app is
  // embedded in Teams (which caches aggressively). Force browsers to revalidate
  // HTML/data on every load so a stale page can never pin old JS, while the
  // content-hashed _next/static assets stay immutably cacheable.
  async headers() {
    // React's dev build uses eval() for debugging (source-mapped callstacks); its prod build never
    // does. So 'unsafe-eval' is added to script-src in development ONLY — the shipped CSP stays strict.
    const scriptSrc = ["'self'", "'unsafe-inline'", "https://res.cdn.office.net"];
    if (process.env.NODE_ENV !== "production") scriptSrc.push("'unsafe-eval'");
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      // Full CSP (was frame-ancestors only). Restricts where the page may connect, load images,
      // frames, objects, and set its base — the exfiltration/redress vectors — while keeping
      // frame-ancestors for Teams embedding. script/style keep 'unsafe-inline' because Next's
      // App Router injects inline bootstrap scripts and Tailwind emits inline styles; the res.cdn
      // host is the Teams JS SDK (loaded at runtime by the /teams tab). NONCE-based script-src is
      // the stricter follow-up (needs middleware + Turbopack nonce propagation) — tracked, not here.
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          `script-src ${scriptSrc.join(" ")}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-src 'self' https://login.microsoftonline.com",
          "form-action 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.skype.com https://*.teams.cloud.microsoft https://*.microsoft.com",
        ].join("; "),
      },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/:path((?!_next/static|_next/image|favicon\\.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
