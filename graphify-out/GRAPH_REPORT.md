# Graph Report - .  (2026-07-21)

## Corpus Check
- 272 files · ~163,751 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1445 nodes · 3886 edges · 95 communities (61 shown, 34 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Support Desk API
- Account & Auth Flows
- Admin & Buildings API
- Knowledge Base API
- Entra SSO / Org Consent
- Booking Lifecycle API
- Scheduled Jobs
- Build & Lint Config
- Bookings & Audit Log
- Admin Pages (Directory/Tenants)
- Check-in & Account Pages
- TypeScript Config
- Home & Booking UI
- Booking Rules Engine
- Directory Sync & Onboarding
- Microsoft Teams Integration
- API Keys & Public REST API
- Knowledge Base UI
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 57
- Community 58
- Community 59
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90

## God Nodes (most connected - your core abstractions)
1. `getUser()` - 138 edges
2. `currentTenantId()` - 119 edges
3. `audit()` - 84 edges
4. `cn()` - 43 edges
5. `rateLimit()` - 35 edges
6. `sendMail()` - 30 edges
7. `POST()` - 29 edges
8. `listBookings()` - 28 edges
9. `getStoredPlan()` - 28 edges
10. `listCustomBuildings()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Editor()` --calls--> `renderMarkdown()`  [EXTRACTED]
  app/admin/knowledge/page.tsx → lib/markdown.ts
- `GET()` --calls--> `getUser()`  [EXTRACTED]
  app/api/push/route.ts → lib/server/auth.ts
- `TeamsAuthBridge()` --indirect_call--> `token()`  [INFERRED]
  app/teams/page.tsx → lib/server/graph.ts
- `NavLink()` --calls--> `cn()`  [EXTRACTED]
  components/sidebar.tsx → lib/utils.ts
- `TooltipContent()` --calls--> `cn()`  [EXTRACTED]
  components/ui/tooltip.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Communities (95 total, 34 thin omitted)

### Community 0 - "Support Desk API"
Cohesion: 0.05
Nodes (83): GET(), PATCH(), PatchSchema, GET(), canManage(), DELETE(), GET(), labelFor() (+75 more)

### Community 1 - "Account & Auth Flows"
Cohesion: 0.06
Nodes (69): Body, POST(), Body, POST(), Body, POST(), POST(), CreateUser (+61 more)

### Community 2 - "Admin & Buildings API"
Cohesion: 0.06
Nodes (65): GET(), GET(), GET(), PUT(), DELETE(), POST(), GET(), POST() (+57 more)

### Community 3 - "Knowledge Base API"
Cohesion: 0.08
Nodes (43): canManage(), DELETE(), forbidden(), PUT(), UpdateSchema, allow(), CreateSchema, forbidden() (+35 more)

### Community 4 - "Entra SSO / Org Consent"
Cohesion: 0.07
Nodes (34): GET(), GET(), NOTE: this grants DELEGATED access only, which is all sign-in needs. Directory s, DELETE(), forbidden(), GET(), accountMatchesHost(), authorize() (+26 more)

### Community 5 - "Booking Lifecycle API"
Cohesion: 0.13
Nodes (36): ALLOWED, isoLocal(), PATCH(), TRANSITIONS, displayName(), GET(), GET(), GET() (+28 more)

### Community 6 - "Scheduled Jobs"
Cohesion: 0.12
Nodes (36): displayName(), GET(), liveBuildings(), nextDay(), officeNow(), NOTE: bookings are keyed by floor id (`<root>` or `<root>__floor-N`); we group b, rootOf(), runTask() (+28 more)

### Community 7 - "Build & Lint Config"
Cohesion: 0.05
Nodes (39): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, prisma, tailwindcss, @tailwindcss/postcss (+31 more)

### Community 8 - "Bookings & Audit Log"
Cohesion: 0.14
Nodes (31): GET(), BookingInput, isoLocal, POST(), GET(), AuditEntry, auditSelfTest(), cancelActiveBookingsForBuilding() (+23 more)

### Community 9 - "Admin Pages (Directory/Tenants)"
Cohesion: 0.10
Nodes (29): DirectoryPage(), initials(), relTime(), FEATURES, ManagePanel(), Tenant, TIERS, BookingInput (+21 more)

### Community 10 - "Check-in & Account Pages"
Cohesion: 0.11
Nodes (10): State, metadata, apex(), SsoRelay(), metadata, AuthShell(), LegalShell(), Brand (+2 more)

### Community 11 - "TypeScript Config"
Cohesion: 0.06
Nodes (32): dom, dom.iterable, e2e/**, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+24 more)

### Community 12 - "Home & Booking UI"
Cohesion: 0.12
Nodes (25): HomePage(), kindTag(), BookingItem(), tagColors, Setup, SetupChecklist(), SetupStep, StatCard() (+17 more)

### Community 13 - "Booking Rules Engine"
Cohesion: 0.12
Nodes (26): addDays(), BookingPolicy, daysBetween(), deriveTimes(), iso(), MAX_DAYS, minutesOfDay(), nowInTz() (+18 more)

### Community 14 - "Directory Sync & Onboarding"
Cohesion: 0.13
Nodes (24): Body, forbidden(), GET(), PUT(), GET(), DirectoryEntry, directoryStatus, EntraGroup (+16 more)

### Community 15 - "Microsoft Teams Integration"
Cohesion: 0.07
Nodes (29): app.roamhub360.com, identity, messageTeamMembers, accentColor, configurableTabs, description, full, short (+21 more)

### Community 16 - "API Keys & Public REST API"
Cohesion: 0.16
Nodes (24): DELETE(), GET(), guard(), POST(), GET(), KINDS, GET(), apiAuth() (+16 more)

### Community 17 - "Knowledge Base UI"
Cohesion: 0.09
Nodes (22): Editing, Editor(), KnowledgePage(), Scope, BUILTIN_ITEMS, CATEGORIES, HelpButton(), View (+14 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (23): Ctx, LocationCtx, LocationProvider(), DEFAULT_TZ, FlatOffice, LOCATIONS, OFFICE_TZ, officeById() (+15 more)

### Community 19 - "Community 19"
Cohesion: 0.20
Nodes (22): DELETE(), GET(), operator(), PATCH, POST(), workspaceUrl(), GET(), audit() (+14 more)

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (22): GET(), msg(), NO_STORE, POST(), allDayRange(), BookingEventOpts, credsFor(), gfetch() (+14 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (18): Assignment, AssignPage(), BuildingsPage(), FloorManager(), BUILDINGS, addCustomBuilding(), announceBuildingsChanged(), BuildingsMeta (+10 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (14): accentStyle(), body, display, metadata, mono, RootLayout(), viewport, CookieConsent() (+6 more)

### Community 23 - "Community 23"
Cohesion: 0.23
Nodes (18): adminOnly(), GET(), POST(), PUT(), Save, decryptSecret(), encryptionAvailable(), encryptSecret() (+10 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (16): Entry, LABEL, ApiKeyPublic, copy(), DeveloperPage(), EVENTS, Integrations, WebhookEndpoint (+8 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (16): Detail(), Filter, PRIORITY_STYLE, rel(), SupportQueuePage(), CATEGORIES, SupportPage(), View (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (16): GET(), computeLicenseState(), Effective, LicenseCore, LicenseState, LicenseTier, base, NOW (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.24
Nodes (17): DELETE(), forbidden(), GET(), guard(), POST(), PUT(), addWebhook(), getIntegrations() (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (11): blankPlan(), clone(), EditorPage(), COUNTRIES, REGIONS, TIMEZONES, tzLabel(), tzOffsetMinutes() (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (15): BookPage(), DeskHoverCard(), Detail(), HOVER_STATUS, spaceLabel(), TABS, FloorSvg(), ITEMS (+7 more)

### Community 31 - "Community 31"
Cohesion: 0.21
Nodes (11): EditorCanvas(), isSpace(), deskPath(), DeskShape(), fillFor(), lines(), ParkingShape(), RoomShape() (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (13): POST(), POST(), requestOrigin(), BillingProviderId, createCheckout(), handleWebhook(), KEY, PRICE (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (12): KIND_LABEL, MinePage(), Bk, NotificationsBell(), StatusPill(), styles, Variant, ACTIVE_STATUS (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.21
Nodes (14): Avatar(), initials(), KIND, prettyDate(), shiftDay(), TeamPage(), timeRange(), todayLocal() (+6 more)

### Community 35 - "Community 35"
Cohesion: 0.21
Nodes (10): fmtDate(), LicensePage(), StatusBanner(), TIER_LABEL, Kind, nudge(), Tone, UpgradeNudge() (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (10): blank(), FormState, providerLabel(), Role, SiteOpt, User, UsersPage(), ROLE_MAP (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.19
Nodes (7): SettingsPage(), ChangePassword(), PushToggle(), TwoFactor(), getPrefs(), updatePrefs(), UserPrefs

### Community 38 - "Community 38"
Cohesion: 0.27
Nodes (11): Body, POST(), workspaceUrl(), Create, GET(), POST(), saveLicense(), createTenant() (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (4): Analytics, daysAgo(), InsightsPage(), today()

### Community 40 - "Community 40"
Cohesion: 0.23
Nodes (6): FEATURES, metadata, SignInPage(), RoamHubMark(), SignInForm(), workspaceOrigin()

### Community 41 - "Community 41"
Cohesion: 0.21
Nodes (11): AssistantWidget(), Msg, SUGGESTIONS, askAssistant(), assistantConfigured(), BookingProposal, createBookingApi(), editBookingApi() (+3 more)

### Community 42 - "Community 42"
Cohesion: 0.27
Nodes (9): EXPIRY_THRESHOLDS, ExpiryNotice, pickExpiryNotice(), OPS, runLicenseChecks(), getNotifiedThresholds(), markNotifiedThresholds(), prisma() (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.26
Nodes (9): api(), book(), created, D, DEFAULT_ELS, freshBuilding(), H(), patch() (+1 more)

### Community 44 - "Community 44"
Cohesion: 0.27
Nodes (7): AppShell(), BipEvent, InstallPrompt(), MobileTabBar(), TABS, BARE_PREFIXES, isBareRoute()

### Community 45 - "Community 45"
Cohesion: 0.35
Nodes (7): initials(), NavLink(), Sidebar(), NAV_ADMIN, NAV_MAIN, NavItem, Role

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (7): GET(), POST(), scaleEls(), scaleFactors(), getPlanImage(), putPlanImage(), FloorEl

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (6): useLocation(), LocationPicker(), MobileNav(), TeamsBadge(), ThemeToggle(), Topbar()

### Community 48 - "Community 48"
Cohesion: 0.42
Nodes (6): normalize(), Searchable, searchArticles(), STOP, ARTICLES, tokenize()

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (7): @anthropic-ai/sdk, @azure/storage-blob, dependencies, @anthropic-ai/sdk, @azure/storage-blob, shadcn, shadcn

### Community 50 - "Community 50"
Cohesion: 0.60
Nodes (3): lastMonthRange(), emailBrand, runMonthlyReport()

### Community 52 - "Community 52"
Cohesion: 0.40
Nodes (4): JWT, next-auth, next-auth/jwt, Session

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (3): loadScript(), TeamsConfig, TeamsConfigPage()

## Knowledge Gaps
- **332 isolated node(s):** `Entry`, `LABEL`, `ApiKeyPublic`, `WebhookEndpoint`, `Integrations` (+327 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getUser()` connect `Support Desk API` to `Community 32`, `Account & Auth Flows`, `Admin & Buildings API`, `Knowledge Base API`, `Entra SSO / Org Consent`, `Booking Lifecycle API`, `Community 38`, `Bookings & Audit Log`, `Directory Sync & Onboarding`, `Community 46`, `API Keys & Public REST API`, `Community 19`, `Community 20`, `Community 54`, `Community 23`, `Community 27`, `Community 28`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 49` to `Build & Lint Config`, `Community 61`, `Community 62`, `Community 63`, `Community 64`, `Community 66`, `Community 67`, `Community 68`, `Community 70`, `Community 71`, `Community 72`, `Community 74`, `Community 75`, `Community 76`, `Community 77`, `Community 78`, `Community 79`, `Community 80`, `Community 81`, `Community 82`, `Community 83`, `Community 84`, `Community 85`, `Community 86`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `qrcode` connect `Community 77` to `Support Desk API`, `Account & Auth Flows`, `Community 49`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **What connects `Entry`, `LABEL`, `ApiKeyPublic` to the rest of the system?**
  _332 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Support Desk API` be split into smaller, more focused modules?**
  _Cohesion score 0.05413507317933345 - nodes in this community are weakly interconnected._
- **Should `Account & Auth Flows` be split into smaller, more focused modules?**
  _Cohesion score 0.059097127222982215 - nodes in this community are weakly interconnected._
- **Should `Admin & Buildings API` be split into smaller, more focused modules?**
  _Cohesion score 0.05754385964912281 - nodes in this community are weakly interconnected._