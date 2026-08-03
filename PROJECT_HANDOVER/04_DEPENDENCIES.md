# 04 · Dependencies

## Runtime & tooling

| | |
|---|---|
| **Runtime** | Node.js. Container base image: **`node:20-slim`** (Debian, Prisma-friendly). Local dev machines have observed Node 20 / 24 — **target Node 20 LTS to match the container.** |
| **Package manager** | **npm** (there is a `package-lock.json`; `npm ci` is used in the Docker build). |
| **Language** | TypeScript **5** (strict, `noEmit`, `moduleResolution: bundler`, path alias `@/*`). |
| **Framework** | Next.js **16.2.9** (App Router, `output: "standalone"`, Turbopack). |
| **UI runtime** | React **19.2.4** / react-dom **19.2.4**. |

## Production dependencies (why each exists)

| Package | Version | Why |
|---|---|---|
| `next` | 16.2.9 | The framework (UI + API in one app). |
| `react` / `react-dom` | 19.2.4 | UI runtime. |
| `next-auth` | ^5.0.0-beta.31 | **Auth.js v5** — email/password, Entra, Google, Teams SSO; JWT sessions. |
| `@prisma/client` | ^6.19.3 | Postgres ORM client. |
| `zod` | ^4.4.3 | Request-body validation in route handlers. |
| `bcryptjs` | ^3.0.3 | Password hashing for local accounts. |
| `jose` | ^6.2.3 | Verify the Teams SSO token against Microsoft JWKS (`teams-token.ts`). |
| `@anthropic-ai/sdk` | ^0.110.0 | AI concierge (Anthropic driver). |
| `openai` | ^6.45.0 | AI concierge (any OpenAI-compatible endpoint: Gemini/Groq/Mistral/…). |
| `@azure/storage-blob` | ^12.32.0 | **Optional** file storage backend (floor plans/images/attachments) when configured; else local volume. |
| `ioredis` | ^5.11.1 | **Optional** shared rate-limit + SSE pub/sub for multi-replica (H3/H4). Lazy-imported only when `REDIS_URL` set. |
| `web-push` | ^3.6.7 | Opt-in browser push notifications (VAPID). |
| `stripe` | ^22.3.0 | Billing hooks (`lib/server/billing.ts`, `/api/billing`) — pluggable, currently stub/not-live. |
| `qrcode` | ^1.5.4 | Generate desk-check-in QR labels (`/api/qr`, `/labels`). |
| `jspdf` / `jspdf-autotable` | ^4.2.1 / ^5.0.8 | PDF export of analytics/reports. |
| `lucide-react` | ^1.20.0 | Icon set. |
| `sonner` | ^2.0.7 | Toast notifications. |
| `next-themes` | ^0.4.6 | Light/dark theming. |
| `@base-ui/react` | ^1.5.0 | Headless UI primitives (shadcn base). |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | — | Tailwind class composition/variants/animations. |
| `undici` | ^8.8.0 | Custom `fetch` Agent for SSRF-safe outbound webhook egress (IP-pinned; C2). |

## Dev dependencies

| Package | Version | Why |
|---|---|---|
| `prisma` | ^6.19.3 | Prisma CLI (generate, migrate, db push). Runs inside the migrator container. |
| `typescript` | ^5 | Compiler / type-check (`npx tsc --noEmit`). |
| `eslint` + `eslint-config-next` | ^9 / 16.2.9 | Linting (flat config `eslint.config.mjs`). |
| `vitest` | ^4.1.9 | Unit test runner. |
| `tailwindcss` + `@tailwindcss/postcss` | ^4 | CSS framework + PostCSS plugin. |
| `shadcn` | ^4.13.1 | Component CSS (`@import "shadcn/tailwind.css"` in globals.css) — **used via CSS, keep it.** |
| `@types/*` | — | Type defs for node, react, bcryptjs, qrcode, web-push. |

## `overrides` (security pins — H9 / hardening)

```json
"overrides": { "sharp": "^0.35.3", "fast-xml-parser": "^5.10.1" }
```
- **`sharp` ≥ 0.35.3** — patches libvips CVEs (2026); sharp is transitive via Next (image optimization + icon generation).
- **`fast-xml-parser` ≥ 5.10.1** — patches an entity-expansion DoS; transitive via `@azure/storage-blob`.
- Production audit gate: `npm run audit:ci` (`npm audit --omit=dev --audit-level=high`) → **0 high/critical**. (Remaining moderate: `postcss` under the build toolchain — not shipped to runtime.)

## Testing frameworks

- **Vitest 4** — 29 unit test files (pure logic + server helpers with a `server-only` stub via `test/stubs/server-only.ts`). ~170 tests (≈151 pass, 19 skipped).
- **Playwright** (`@playwright/test`) — E2E in `e2e/booking.spec.ts`. **Note:** `@playwright/test` is referenced by config but may need `npm i -D @playwright/test && npx playwright install` on a fresh machine (not in the default dependency set for the container).

## NOT present (despite the template asking)

- **No Azure SDKs beyond `@azure/storage-blob`** (no App Service SDK, no Application Insights SDK).
- **No Microsoft Graph SDK** — Graph is called via plain `fetch` in `lib/server/graph.ts`.
- **No Azure DevOps / GitHub Actions CI** wired in the repo (deploys are manual `docker compose … up`).
- **No Vite / Jest** — the stack uses Next's bundler (Turbopack) + Vitest.
