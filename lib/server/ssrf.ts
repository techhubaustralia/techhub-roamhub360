import "server-only";
import { Agent } from "undici";
import dns from "node:dns";

// SSRF egress guard for server-initiated outbound requests (webhooks, Slack). Two holes closed:
//   1. Redirects — a public URL can 3xx to an internal target. We never follow (redirect: "manual").
//   2. DNS — a public hostname can resolve to a private/reserved IP, or rebind between the safety
//      check and the actual connect. We resolve at connect time inside a custom lookup, reject any
//      private/reserved address, and the connection uses THAT validated address — so there is no
//      check-then-connect gap to rebind through.

/** True for loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT, and
 *  reserved ranges — IPv4 and IPv6, including IPv4-mapped IPv6. */
export function isPrivateIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase();

  // IPv4-mapped IPv6 (::ffff:10.0.0.1) → test the embedded v4.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);

  if (addr.includes(":")) {
    if (addr === "::1" || addr === "::") return true; // loopback / unspecified
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true; // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // fe80::/10 link-local
    return false; // a routable global IPv6
  }

  const o = addr.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → deny
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10/8, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
  return false;
}

// A lookup that resolves normally, drops every private/reserved address, and errors if nothing
// public remains. The dispatcher connects to exactly what this returns — no rebinding window.
// Signature matches undici's connector lookup; typed loosely and cast where handed to the Agent.
type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;
function guardedLookup(hostname: string, options: { all?: boolean }, cb: LookupCb): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return cb(err);
    const safe = (addresses as dns.LookupAddress[]).filter((a) => !isPrivateIp(a.address));
    if (!safe.length) return cb(Object.assign(new Error(`blocked: ${hostname} resolves only to private addresses`), { code: "ESSRFBLOCKED" }));
    // `all` form when the caller asked for it; single form otherwise (mirrors dns.lookup contract).
    return options.all ? cb(null, safe) : cb(null, safe[0].address, safe[0].family);
  });
}

const ssrfAgent = new Agent({ connect: { lookup: guardedLookup as never } });

/** fetch() for server-initiated egress: no redirects, private/reserved IPs blocked at connect time.
 *  The URL's scheme/host should already have passed a static allowlist (safeWebhookUrl). */
export function ssrfSafeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, redirect: "manual", dispatcher: ssrfAgent } as RequestInit & { dispatcher: Agent });
}
