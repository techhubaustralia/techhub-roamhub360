// Built-in Knowledge Base articles — the product help library, shipped IN CODE so the Help panel is
// ALWAYS populated and searchable with zero setup (no database seeding). Customers/operators can add
// EXTRA articles on top of these via Admin -> Knowledge base; those live in the DB. This module is
// client-safe (no server-only / prisma imports) so the Help panel renders built-ins offline.

export interface BuiltinArticle {
  id: string; // stable "builtin:<slug>" — distinguishes from DB article ids
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  body: string; // markdown
  pinned: boolean;
}

interface RawArticle {
  title: string;
  summary?: string;
  category: string;
  body: string;
  pinned?: boolean;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "article";
}

const RAW: RawArticle[] = [
  // ---- Getting started ---------------------------------------------------------------------------
  {
    title: "Getting started with RoamHub360",
    category: "Getting started",
    summary: "Book your first desk, room, office, or parking bay in under a minute.",
    pinned: true,
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
    body: `1. On **Book a space**, choose the **Offices** tab.
2. Tap an available office on the floor plan.
3. Choose your **date** and confirm with **Book**.

Private offices are booked for **one day** at a time. As with desks, check in on the day to hold your space.`,
  },
  {
    title: "Booking a parking bay",
    category: "Booking a space",
    summary: "Reserve a parking bay for your visit.",
    body: `1. On **Book a space**, choose the **Parking** tab.
2. Tap an available **bay** on the plan (bays are labelled *Bay 1*, *Bay 2*, and so on).
3. Pick your **date** and tap **Book**.

Parking bays are reserved for the **whole day** (24 hours), so you're covered whatever time you arrive or leave.`,
  },
  {
    title: "Changing or cancelling a booking",
    category: "Booking a space",
    summary: "Reschedule the time or cancel a space you no longer need.",
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
    body: `Some people need the same desk every day. Open **Permanent desks** in the sidebar (Global or Site Admins).

1. Choose the building and desk.
2. Assign it to a person.

That desk is then reserved for them and won't appear in the hot-desk pool for others.`,
  },
  {
    title: "Admin: connect Microsoft 365 and company sign-in",
    category: "For administrators",
    summary: "Sync your directory, send calendar invites, and enable one-click sign-in.",
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
    body: `Open **Insights** in the sidebar (Global Admins only) to see how your workplace is used:

- Busiest and quietest days.
- Desk, room, and office **utilisation**.
- Building and site comparisons.

Use it to right-size your space, spot underused areas, and plan office days. Reports can be exported for sharing.`,
  },
  {
    title: "Admin: designing a floor plan in the editor",
    category: "For administrators",
    summary: "Place desks, rooms, offices, and parking on your plan.",
    body: `The floor-plan editor turns a picture of your floor into a bookable map.

1. Open **Buildings**, choose a building/floor, and open its **editor**.
2. **Upload a background** image of the floor (a PDF export or photo works).
3. Drop on the spaces you need — **desks**, **meeting rooms**, **offices**, and **parking bays** — and drag them into position.
4. Name and number them, then **save**.

Staff then see this exact layout in **Book a space** and can tap any spot to book it. You can come back and rearrange at any time.`,
  },
  {
    title: "Admin: locking or taking a space out of service",
    category: "For administrators",
    summary: "Temporarily block a desk or room from being booked.",
    body: `Need to take a desk out of action (broken chair, maintenance, a reserved area)? You can lock it.

1. Open **Book a space** as an admin.
2. Select the space on the floor plan.
3. Tap **Lock** to make it unbookable. Tap **Unlock** to release it again.

Locked spaces stay visible on the plan but can't be booked until you unlock them. (Permanently assigned desks show as locked automatically — see *Assigning permanent desks*.)`,
  },
  {
    title: "Admin: printing QR check-in labels",
    category: "For administrators",
    summary: "Print a scannable code for every desk and room.",
    body: `QR labels let people check in by scanning the code at their space.

1. Open **QR labels** in the sidebar.
2. Choose a **building**.
3. Print the sheet — you get one QR card per desk/room.

Cut them out and stick each on its space. When someone scans a card, they're checked in to that space instantly. Re-print any time you add or rename spaces.`,
  },
  {
    title: "Admin: syncing your staff directory",
    category: "For administrators",
    summary: "Pull names, photos, and departments from Microsoft 365.",
    body: `Directory sync makes **Who's in** richer — real names, photos, departments, and job titles instead of just email addresses.

1. First connect **Microsoft 365** (see *Connect Microsoft 365 and company sign-in*).
2. Open **Directory** in the sidebar.
3. Tap **Sync** to pull your organisation's people from Microsoft.

Run it again whenever your team changes. Directory sync needs the **User.Read.All** permission granted on your Microsoft app.

> If you don't see **Directory**, the feature may be turned off for your workspace.`,
  },
  {
    title: "Admin: your plan, licence and renewal",
    category: "For administrators",
    summary: "Check your subscription, usage, and renewal date.",
    body: `Open **Plan & licence** in the sidebar (Global Admins only) to see:

- your current **plan**,
- **usage** against it, and
- your **renewal date**.

## What happens at renewal
- **Before expiry** you'll see a reminder with the date.
- **After expiry** there's a short grace period, then the workspace becomes **read-only** — existing bookings stay visible but no new ones can be made until you renew.

To renew or change plan, contact your RoamHub360 provider (use the **Help → Contact support** button).`,
  },
  {
    title: "Admin: automating with the API, webhooks and Slack",
    category: "For administrators",
    summary: "Connect RoamHub360 to your own tools.",
    body: `Open **Developer & API** in the sidebar (Global Admins only).

## API keys
Create a key to use the RoamHub360 **REST API** from your own scripts or systems. Keep keys secret; revoke and re-create them any time.

## Webhooks
Add a webhook URL to get a live callback when bookings are created, changed, or cancelled — handy for dashboards or automations. You choose which events to receive.

## Slack
Paste a Slack **Incoming Webhook** URL to post booking activity straight into a channel.

> For security, webhook and Slack URLs must be public **https** addresses.`,
  },
  {
    title: "Admin: viewing the activity log",
    category: "For administrators",
    summary: "See who did what, and when.",
    body: `The **Activity log** (sidebar, Global Admins only) records key actions in your workspace — bookings, cancellations, user and role changes, integration updates, and more.

Use it to answer "who changed this?" and to keep an audit trail. Entries show the person, the action, and the time.`,
  },

  // ---- Access & features -------------------------------------------------------------------------
  {
    title: "Booking on behalf of someone else",
    category: "Booking a space",
    summary: "Admins and office managers can book for colleagues or visitors.",
    body: `If you're an **admin** or marked as an **Office Manager**, you can book a space for someone else.

1. Open **Book a space** and select a space as usual.
2. In the booking panel, enter the **email address** of the person you're booking for.
3. Confirm the booking.

They'll get a confirmation and the booking shows under their **My bookings**. Leave the email blank to book for yourself.`,
  },
  {
    title: "Ask Hubbi to find and book a space",
    category: "Booking a space",
    summary: "Book in plain English with the AI assistant.",
    body: `**Hubbi** is the built-in assistant. Tap **Ask Hubbi** (bottom of the screen) and type what you need, for example:

- "Book me a desk tomorrow"
- "Find a meeting room for 4 this afternoon"
- "Who's in on Friday?"
- "What are my bookings?"

Hubbi finds a suitable space and books it for you after you confirm.

> If you don't see **Ask Hubbi**, the assistant isn't enabled for your workspace — you can still book normally from **Book a space**.`,
  },
  {
    title: "Finding your way around RoamHub360",
    category: "Getting started",
    summary: "A quick tour of the menu and toolbar.",
    body: `Here's where everything lives.

## Sidebar (left)
- **Home** — your dashboard and today's activity.
- **Book a space** — reserve desks, rooms, offices, parking.
- **My bookings** — everything you've reserved.
- **Who's in** — who's in the office on a given day.
- **Settings** — your privacy, notifications, and account.

Admins also see management pages (Buildings, Users & roles, Insights, and more).

## Top bar (right)
- **Theme** — switch light/dark.
- **Help** (life-buoy) — search these articles or contact support.
- **Bell** — your upcoming bookings.

## Ask Hubbi
If enabled, the **Ask Hubbi** button lets you book in plain English.`,
  },
  {
    title: "Why can't I see a certain feature?",
    category: "Your account",
    summary: "Some features are switched on per workspace.",
    body: `RoamHub360 has optional features your provider can turn on or off per workspace, including:

- **Who's in** (team presence),
- **Directory sync** (names/photos from Microsoft),
- the **daily digest** email, and
- the **Hubbi** AI assistant.

If a page or button in this help centre isn't showing for you, it's likely switched off for your workspace, or your role doesn't include it. Ask your workspace's Global Admin, or use **Help → Contact support**.`,
  },
  {
    title: "Using RoamHub360 in Microsoft Teams",
    category: "Mobile app",
    summary: "Book without leaving Microsoft Teams.",
    body: `RoamHub360 can run as a tab inside **Microsoft Teams**, so your team books where they already work.

Once your administrator adds the RoamHub360 app to Teams:
1. Open the **RoamHub360** tab in Teams.
2. You're signed in automatically with your Microsoft account.
3. Book desks, rooms, and more — just like the web app.

> Adding the app to Teams is done once by an administrator. Ask yours if you don't see it yet.`,
  },
];

export const BUILTIN_ARTICLES: BuiltinArticle[] = RAW.map((a) => ({
  id: `builtin:${slugify(a.title)}`,
  slug: slugify(a.title),
  title: a.title,
  summary: a.summary ?? null,
  category: a.category,
  body: a.body,
  pinned: Boolean(a.pinned),
}));
