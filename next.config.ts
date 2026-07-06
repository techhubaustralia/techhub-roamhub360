import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone server bundle for the container image (Azure Container Apps)
  output: "standalone",
  // There is no CDN/Front Door in front of the custom domain, and the app is
  // embedded in Teams (which caches aggressively). Force browsers to revalidate
  // HTML/data on every load so a stale page can never pin old JS, while the
  // content-hashed _next/static assets stay immutably cacheable.
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      // Allow embedding only by our own origin and the Microsoft Teams clients (the app
      // ships as a Teams tab). A frame-ancestors-only CSP is safe — it controls embedding
      // for clickjacking protection without restricting the app's own scripts/styles.
      {
        key: "Content-Security-Policy",
        value:
          "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.skype.com https://*.teams.cloud.microsoft https://*.microsoft.com",
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
