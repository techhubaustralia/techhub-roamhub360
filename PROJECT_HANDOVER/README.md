# RoamHub360 — Project Handover Package

Complete documentation for migrating this project to a new machine and continuing development. Generated
2026-07-22 by inspection only (no code was modified).

**Start here:** paste `PROJECT_IMPORT_PROMPT.md` into Claude Code on the new machine, then read the docs
in the order it lists (beginning with `16_AI_CONTEXT.md`).

## Contents

| # | Document | What it covers |
|---|---|---|
| 01 | `01_PROJECT_OVERVIEW.md` | Product, provider, stack, architecture, maturity, limitations. |
| 02 | `02_ARCHITECTURE.md` | Full architecture + Mermaid diagrams (auth, jobs, tenancy, data flow). |
| 03 | `03_FOLDER_STRUCTURE.md` | Every important folder/file and its responsibility. |
| 04 | `04_DEPENDENCIES.md` | Runtime, Node, npm, framework + every dependency and why. |
| 05 | `05_ENVIRONMENT_CONFIGURATION.md` | Every env var (names only), purpose, required?, used-by. |
| 06 | `06_DATABASE.md` | Provider, 14 Prisma models, relationships, indexes, migrations, seed. |
| 07 | `07_API_DOCUMENTATION.md` | ~70 API routes: method, auth, permission, rules, errors. |
| 08 | `08_FEATURE_STATUS.md` | Feature matrix (complete/partial/planned/disabled). |
| 09 | `09_CHANGELOG.md` | Phase-by-phase history + known issues. |
| 10 | `10_PENDING_WORK.md` | Bugs, tech debt, enhancements — priority + effort + deps. |
| 11 | `11_TESTING_GUIDE.md` | How to run every test suite; coverage; reproducing bugs. |
| 12 | `12_DEPLOYMENT_GUIDE.md` | Dev/staging/prod, droplet topology, build/release/rollback. |
| 13 | `13_COMMERCIAL_CONFIGURATION.md` | Branding, licensing, tenants, Graph onboarding, Teams. |
| 14 | `14_SECURITY_REVIEW.md` | Auth, authz, secrets, encryption, rate-limit, audit, risks. |
| 15 | `15_SETUP_ON_NEW_MACHINE.md` | Clone → install → env → DB → run → test → deploy → troubleshoot. |
| 16 | `16_AI_CONTEXT.md` | **The key doc** — everything a new Claude instance must know. |
| 17 | `17_CURRENT_STATE.md` | Exactly where the project stands today. |
| 18 | `18_COMMAND_REFERENCE.md` | Every useful command. |
| 19 | `19_FILE_MANIFEST.md` | Important files: path, purpose, criticality. |
| 20 | `20_HANDOVER_SUMMARY.md` | Executive summary + exact next tasks. |
| — | `PROJECT_IMPORT_PROMPT.md` | Paste-into-Claude-Code prompt for the new machine. |

## One-line status

RoamHub360 is **live in production** (DigitalOcean droplet, Docker + Postgres + Caddy) having just
completed an enterprise-hardening pass; the top pending item is applying **C4 (DB-level tenant
isolation, FK + RLS)** against a staging database. It has **migrated off Azure** — treat the droplet as
the source of truth for infra.
