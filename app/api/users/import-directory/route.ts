import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { createUser, listUsers } from "@/lib/server/users";
import { getDirectoryMap } from "@/lib/server/directory";
import { audit } from "@/lib/server/db";

// "Import from Microsoft 365" (Users & roles): pre-provision workspace users from the synced Entra
// directory. Workspace-admin only, strictly tenant-scoped — the directory map and the user list are
// both the caller's workspace, so an email that isn't in THIS workspace's synced directory is
// skipped, never created. Imported users are SSO accounts (no password, no invite email): they
// sign in with Microsoft, which is why they were in the directory in the first place. Nothing here
// touches directory sync, CSV import, or first-login auto-provisioning.
export const runtime = "nodejs";

const SSO_PROVIDER = "microsoft-entra-id"; // the Auth.js provider id used on Entra sign-in

const Body = z.object({
  emails: z.array(z.string().email()).min(1).max(500),
  role: z.enum(["global-admin", "site-admin", "staff"]).default("staff"),
});

export async function POST(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Provide 1–500 valid emails and a role." }, { status: 400 });
  const { role } = parsed.data;
  const emails = [...new Set(parsed.data.emails.map((e) => e.toLowerCase()))];

  let existing: Set<string>;
  let dir: Awaited<ReturnType<typeof getDirectoryMap>>;
  try {
    [existing, dir] = await Promise.all([
      listUsers().then((rows) => new Set(rows.map((u) => u.email.toLowerCase()))),
      getDirectoryMap(emails),
    ]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unavailable" }, { status: 503 });
  }

  let created = 0;
  const skipped: { email: string; reason: string }[] = [];
  for (const email of emails) {
    const entry = dir[email];
    if (!entry) { skipped.push({ email, reason: "Not in the synced directory" }); continue; }
    if (existing.has(email)) { skipped.push({ email, reason: "Already a user" }); continue; }
    try {
      await createUser({ email, name: entry.displayName, role, provider: SSO_PROVIDER });
      created++;
    } catch (e) {
      skipped.push({ email, reason: e instanceof Error && /unique/i.test(e.message) ? "Already a user" : "Could not create" });
    }
  }
  await audit(me.email, "user.import-directory", `${created} created as ${role}, ${skipped.length} skipped`);
  return NextResponse.json({ created, skipped });
}
