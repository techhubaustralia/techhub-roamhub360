import "server-only";

// Knowledge Base data access. Articles are either GLOBAL (tenantId = null; authored by the platform
// team, visible in every workspace) or TENANT-SCOPED (authored by a workspace's Global Admin). The
// in-app viewer merges global + the current tenant's own published articles.
/* eslint-disable @typescript-eslint/no-explicit-any */

const useSql = Boolean(process.env.DATABASE_URL);

let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!_prisma) {
    const mod: any = await import("@prisma/client");
    _prisma = new mod.PrismaClient();
  }
  return _prisma;
}

export interface KbListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  pinned: boolean;
  scope: "global" | "tenant";
}

export interface KbArticle extends KbListItem {
  body: string;
  published: boolean;
  sort: number;
  views: number;
  createdBy: string | null;
  updatedAt: string;
  tenantId: string | null;
}

function toItem(r: any): KbListItem {
  return { id: r.id, slug: r.slug, title: r.title, summary: r.summary ?? null, category: r.category, pinned: r.pinned, scope: r.tenantId ? "tenant" : "global" };
}
function toFull(r: any): KbArticle {
  return { ...toItem(r), body: r.body, published: r.published, sort: r.sort, views: r.views, createdBy: r.createdBy ?? null, updatedAt: (r.updatedAt as Date).toISOString(), tenantId: r.tenantId ?? null };
}

// Stable ordering: pinned first, then by category, manual sort, then title.
const ORDER = [{ pinned: "desc" as const }, { category: "asc" as const }, { sort: "asc" as const }, { title: "asc" as const }];

export function slugify(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "article"
  );
}

/** Published articles a workspace's user may see: global + that tenant's own. */
export async function listArticlesForViewer(tenantId: string): Promise<KbListItem[]> {
  if (!useSql) return [];
  const p = await prisma();
  const rows = await p.kbArticle.findMany({ where: { published: true, OR: [{ tenantId: null }, { tenantId }] }, orderBy: ORDER });
  return rows.map(toItem);
}

/** A single published article the viewer is allowed to read; bumps the view counter. */
export async function getViewerArticle(id: string, tenantId: string): Promise<KbArticle | null> {
  if (!useSql) return null;
  const p = await prisma();
  const row = await p.kbArticle.findUnique({ where: { id } });
  if (!row || !row.published) return null;
  if (row.tenantId && row.tenantId !== tenantId) return null; // another tenant's private article
  await p.kbArticle.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});
  return toFull(row);
}

/** All articles (incl. drafts) in a management scope. `global` requires a platform operator; the
 *  tenant scope is filtered to that workspace — both enforced at the route layer. */
export async function listArticlesForAdmin(scope: "global" | "tenant", tenantId: string): Promise<KbArticle[]> {
  if (!useSql) return [];
  const p = await prisma();
  const rows = await p.kbArticle.findMany({ where: { tenantId: scope === "global" ? null : tenantId }, orderBy: ORDER });
  return rows.map(toFull);
}

export async function getArticleById(id: string): Promise<KbArticle | null> {
  if (!useSql) return null;
  const p = await prisma();
  const row = await p.kbArticle.findUnique({ where: { id } });
  return row ? toFull(row) : null;
}

export interface KbInput {
  title: string;
  summary?: string | null;
  category?: string;
  body: string;
  published?: boolean;
  pinned?: boolean;
  sort?: number;
}

async function uniqueSlug(p: any, tenantId: string | null, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  for (let n = 2; n < 100; n++) {
    const clash = await p.kbArticle.findFirst({ where: { tenantId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function createArticle(scope: "global" | "tenant", tenantId: string, input: KbInput, byEmail: string): Promise<KbArticle> {
  const p = await prisma();
  const tid = scope === "global" ? null : tenantId;
  const slug = await uniqueSlug(p, tid, slugify(input.title));
  const row = await p.kbArticle.create({
    data: {
      tenantId: tid,
      slug,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      category: input.category?.trim() || "General",
      body: input.body,
      published: input.published ?? false,
      pinned: input.pinned ?? false,
      sort: input.sort ?? 0,
      createdBy: byEmail,
    },
  });
  return toFull(row);
}

export async function updateArticle(id: string, input: Partial<KbInput>): Promise<KbArticle> {
  const p = await prisma();
  const existing = await p.kbArticle.findUnique({ where: { id } });
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    data.title = input.title.trim();
    data.slug = await uniqueSlug(p, existing?.tenantId ?? null, slugify(input.title), id);
  }
  if (input.summary !== undefined) data.summary = input.summary?.trim() || null;
  if (input.category !== undefined) data.category = input.category.trim() || "General";
  if (input.body !== undefined) data.body = input.body;
  if (input.published !== undefined) data.published = input.published;
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.sort !== undefined) data.sort = input.sort;
  const row = await p.kbArticle.update({ where: { id }, data });
  return toFull(row);
}

export async function deleteArticle(id: string): Promise<void> {
  const p = await prisma();
  await p.kbArticle.delete({ where: { id } }).catch(() => {});
}

// Starter GLOBAL articles a platform operator drops in with one click. Seeding is ADDITIVE and
// idempotent: it inserts only the articles whose title isn't already present, so it's safe to click
// again after this set grows (tops up the missing ones, never duplicates).
const STARTER: KbInput[] = [
  // ---- Getting started ---------------------------------------------------------------------------
  {
    title: "Getting started with RoamHub360",
    category: "Getting started",
    summary: "Book your first desk, room, office, or parking bay in under a minute.",
    pinned: true,
    published: true,
    body: `Welcome to **RoamHub360** — your workplace booking hub. Here's the quick tour.

## Book a space
1. Open **Book a space** from the sidebar.
2. Pick your building at the top, then choose a tab: **Desks**, **Meeting rooms**, **Offices**, or **Parking**.
3. Tap an available spot on the floor plan (green = free), set your date and time, and hit **Book**.

## Find your bookings
- **My bookings** lists everything you've reserved, upcoming and past.
- The **bell** icon (top right) shows what's coming up next.

## On the day
Open the booking and tap **Check in** — or scan the **QR code** at the desk — so your space is held for you.

## Need a hand?
Tap the **life-buoy** icon (top right) any time to search these help articles or message our support team.`,
  },
  {
    title: "Signing in to RoamHub360",
    category: "Getting started",
    summary: "Sign in with your work Microsoft account or an email and password.",
    published: true,
    body: `There are two ways to sign in, depending on how your workspace is set up.

## Continue with Microsoft
If your company uses Microsoft 365, tap **Continue with Microsoft** and sign in with your normal work account — no separate password to remember.

## Email and password
Otherwise, enter the email address your admin invited and your password. First time in? Use the **Set your password** link from your invite email.

## Forgot your password?
On the sign-in page, tap **Forgot password** and we'll email you a reset link. It expires in 24 hours.

> Your workspace lives at its own web address (for example \`yourcompany.roamhub360.com\`). Always sign in there, not the main site.`,
  },

  // ---- Booking a space ---------------------------------------------------------------------------
  {
    title: "Booking a desk",
    category: "Booking a space",
    summary: "Reserve a hot desk for a day or several days.",
    published: true,
    body: `1. Go to **Book a space** and make sure the **Desks** tab is selected.
2. Choose your **building** at the top of the page.
3. On the floor plan, tap any **available** desk (shown in green). Hover to see the desk number.
4. Pick your **date** and **time**, then tap **Book this desk**.

A desk booking can span up to **14 days**. Once booked, it appears under **My bookings**, and you'll get a confirmation.

> Remember to **check in** on the day — desks left unclaimed may be released for colleagues.`,
  },
  {
    title: "Booking a meeting room",
    category: "Booking a space",
    summary: "Reserve a meeting room and (optionally) add it to your calendar.",
    published: true,
    body: `1. On **Book a space**, choose the **Meeting rooms** tab.
2. Tap an available room on the floor plan. Each room shows how many **people** it seats.
3. Set the **date** and **start/end time**, then tap **Book**.

Meeting rooms are booked by the hour and follow your site's opening hours. Your administrator may set a maximum length per room.

## Calendar invite
If your workspace is connected to **Microsoft 365**, the booking can add the room to your Outlook/Teams calendar and reserve it automatically.`,
  },
  {
    title: "Booking a private office",
    category: "Booking a space",
    summary: "Reserve a private office for a full day.",
    published: true,
    body: `1. On **Book a space**, choose the **Offices** tab.
2. Tap an available office on the floor plan.
3. Choose your **date** and confirm with **Book**.

Private offices are booked for **one day** at a time. As with desks, check in on the day to hold your space.`,
  },
  {
    title: "Booking a parking bay",
    category: "Booking a space",
    summary: "Reserve a parking bay for your visit.",
    published: true,
    body: `1. On **Book a space**, choose the **Parking** tab.
2. Tap an available **bay** on the plan (bays are labelled *Bay 1*, *Bay 2*, and so on).
3. Pick your **date** and tap **Book**.

Parking bays are reserved for the **whole day** (24 hours), so you're covered whatever time you arrive or leave.`,
  },
  {
    title: "Changing or cancelling a booking",
    category: "Booking a space",
    summary: "Reschedule the time or cancel a space you no longer need.",
    published: true,
    body: `Open **My bookings** from the sidebar and find the booking.

## Reschedule
Tap **Reschedule** to change the date or time. The app re-checks availability and your site's rules before saving. (Some sites limit how far changes can be made — your admin sets this.)

## Cancel
Tap **Cancel** to release the space. Please cancel bookings you won't use so a colleague can take the spot.

Any linked calendar event is updated or removed automatically.`,
  },

  // ---- On the day --------------------------------------------------------------------------------
  {
    title: "Checking in and out",
    category: "On the day",
    summary: "Hold your space by checking in, and free it when you leave.",
    published: true,
    body: `Checking in tells us you've arrived so your space is held for you.

## Check in
- Open **My bookings** and tap **Check in**, or
- Scan the **QR code** at the desk or room.

## Check out
Leaving early? Tap **Check out** to release the space so someone else can use it.

If you don't check out, you'll be checked out automatically at the end of the day (around 17:30 by default).`,
  },
  {
    title: "Checking in with a QR code",
    category: "On the day",
    summary: "Scan the code at the desk to check in instantly.",
    published: true,
    body: `Every desk and room can display a **QR code** label.

1. Open your phone's camera (or the RoamHub360 app) and point it at the code.
2. Tap the link that appears.
3. You're checked in — no need to find the booking first.

This is the fastest way to claim your space when you arrive.

> Admins: print QR labels from **QR labels** in the sidebar.`,
  },
  {
    title: "What happens if I don't check in?",
    category: "On the day",
    summary: "Unclaimed desks are released so seats aren't wasted.",
    published: true,
    body: `To keep desks from sitting empty, spaces that aren't **checked in** may be **auto-released** after a grace period and offered back to colleagues.

If that happens:
- You'll see the booking marked as released under **My bookings**.
- You can simply **book again** if a space is still free.

The simplest way to avoid it: check in when you arrive, or scan the desk's QR code.`,
  },

  // ---- Teamwork ----------------------------------------------------------------------------------
  {
    title: "See who's in the office",
    category: "Teamwork",
    summary: "Coordinate office days with the Who's in board.",
    published: true,
    body: `The **Who's in** page shows which colleagues are booked or checked in on a given day, so you can plan to come in when your team does.

- Switch dates to look ahead.
- See names, and (if your workspace syncs its directory) photos and departments.

Prefer to keep your days private? See *Your privacy and the "Who's in" board*.

> If you don't see this page, your workspace may have the feature turned off.`,
  },
  {
    title: "Get the daily \"who's in\" digest",
    category: "Teamwork",
    summary: "A morning email of who's booked at your site today.",
    published: true,
    body: `Turn on a morning email that lists which colleagues are booked at your site that day.

1. Open **Settings**.
2. Under **Notifications**, switch on **Daily "who's in" digest**.

The digest is only sent on days you actually have a booking, so it stays relevant.`,
  },

  // ---- Your account ------------------------------------------------------------------------------
  {
    title: "Notifications and device push",
    category: "Your account",
    summary: "Get instant alerts when bookings are confirmed or changed.",
    published: true,
    body: `RoamHub360 keeps you posted by email, and can also send **push notifications** straight to your device.

## Turn on device push
1. Open **Settings**.
2. Under **Notifications**, enable **device push** and allow notifications when your browser asks.

You'll then get instant alerts for booking confirmations, changes, and reminders — no need to check your email.

> Push works on desktop and on the mobile app. If you don't see the option, your workspace hasn't enabled it yet.`,
  },
  {
    title: "Your privacy and the \"Who's in\" board",
    category: "Your account",
    summary: "Choose whether colleagues can see your office days.",
    published: true,
    body: `You control whether your bookings appear on the **Who's in** board.

1. Open **Settings**.
2. Under **Privacy**, toggle **Show me on "Who's in"**.

- **On** — colleagues in your workspace can see you're booked or checked in on a given day.
- **Off** — only you can see your own bookings there.

This only affects the Who's in board. Your admin can always see bookings for space-management purposes.`,
  },
  {
    title: "Set up two-factor authentication (2FA)",
    category: "Your account",
    summary: "Add a second step at sign-in for extra security.",
    published: true,
    body: `Two-factor authentication adds a one-time code from an authenticator app on top of your password.

1. Open **Settings** and find the **Account** section.
2. Tap **Set up two-factor authentication**.
3. Scan the QR code with an authenticator app (Microsoft Authenticator, Google Authenticator, Authy…).
4. Enter the 6-digit code to confirm.

From then on, you'll enter a code from the app each time you sign in with your password.

> 2FA applies to email/password sign-in. If you sign in with Microsoft, your organisation's own security (including its MFA) already applies.`,
  },
  {
    title: "Change your password",
    category: "Your account",
    summary: "Update the password you use to sign in.",
    published: true,
    body: `1. Open **Settings** and find the **Account** section.
2. Under **Change password**, enter your current password and a new one.
3. Save.

If you've forgotten your current password, sign out and use **Forgot password** on the sign-in page instead.

> Signing in with Microsoft? You don't have a RoamHub360 password — your Microsoft account handles it.`,
  },

  // ---- Mobile app --------------------------------------------------------------------------------
  {
    title: "Using the RoamHub360 mobile app",
    category: "Mobile app",
    summary: "Book on the go from the Android or iOS app.",
    published: true,
    body: `The mobile app gives you the full booking experience on your phone.

## First time
1. Open the app.
2. Enter your **workspace name** (the first part of your web address — e.g. \`yourcompany\`).
3. Sign in as you would on the web.

The app remembers your workspace, so next time it opens straight to sign-in.

## Everyday use
- Book desks, rooms, offices, and parking.
- Scan a desk's **QR code** to check in.
- Get **push notifications** for confirmations and reminders.`,
  },

  // ---- For administrators ------------------------------------------------------------------------
  {
    title: "Admin: inviting people and setting roles",
    category: "For administrators",
    summary: "Add colleagues and choose what they can do.",
    published: true,
    body: `Open **Users & roles** in the sidebar (Global Admins only).

## Invite someone
Enter their email and send the invite — they'll get a link to set a password, or can sign in with Microsoft if your workspace uses it.

## Roles
- **Staff** — book spaces for themselves.
- **Site Admin** — manage bookings and permanent desks for their site.
- **Global Admin** — full control: buildings, users, integrations, and settings.

You can also mark someone as an **Office Manager** so they can book multiple desks per day (for a team or visitors).`,
  },
  {
    title: "Admin: adding buildings and floor plans",
    category: "For administrators",
    summary: "Set up your sites, spaces, and interactive floor plans.",
    published: true,
    body: `Open **Buildings** in the sidebar (Global Admins only).

1. **Add a building** — give it a name and pick its **timezone** so booking dates follow local time.
2. **Add floors and spaces** — desks, rooms, offices, and parking bays.
3. **Upload a floor plan** image and place spaces on it so staff can book visually.

## QR labels
Once desks are set up, print scannable check-in labels from **QR labels** in the sidebar.`,
  },
  {
    title: "Admin: assigning permanent desks",
    category: "For administrators",
    summary: "Reserve a desk permanently for a specific person.",
    published: true,
    body: `Some people need the same desk every day. Open **Permanent desks** in the sidebar (Global or Site Admins).

1. Choose the building and desk.
2. Assign it to a person.

That desk is then reserved for them and won't appear in the hot-desk pool for others.`,
  },
  {
    title: "Admin: connect Microsoft 365 and company sign-in",
    category: "For administrators",
    summary: "Sync your directory, send calendar invites, and enable one-click sign-in.",
    published: true,
    body: `Open **Microsoft 365** in the sidebar (Global Admins only).

## Company sign-in (recommended)
Tap **Connect your organisation**. Your IT admin approves RoamHub360 once for the whole company — after that, everyone signs in with their Microsoft account, no invites needed.

## Directory & calendar
Connecting Microsoft 365 also lets RoamHub360:
- show real names, photos, and departments on **Who's in**, and
- add room bookings to Outlook/Teams calendars.

You'll need your organisation's **Directory (tenant) ID**, an **app registration**, and a **client secret** — the page walks you through it.`,
  },
  {
    title: "Admin: understanding insights and reports",
    category: "For administrators",
    summary: "See how your spaces are actually used.",
    published: true,
    body: `Open **Insights** in the sidebar (Global Admins only) to see how your workplace is used:

- Busiest and quietest days.
- Desk, room, and office **utilisation**.
- Building and site comparisons.

Use it to right-size your space, spot underused areas, and plan office days. Reports can be exported for sharing.`,
  },
];

export async function seedGlobalArticles(byEmail: string): Promise<number> {
  const p = await prisma();
  const existing = await p.kbArticle.findMany({ where: { tenantId: null }, select: { title: true } });
  const have = new Set(existing.map((e: { title: string }) => e.title.toLowerCase().trim()));
  let n = 0;
  for (const a of STARTER) {
    if (have.has(a.title.toLowerCase().trim())) continue; // additive: skip ones already present
    await createArticle("global", "default", a, byEmail);
    n++;
  }
  return n;
}
