import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { createUser } from "@/lib/server/users";
import { sendInvite } from "@/lib/server/invite";
import { audit } from "@/lib/server/db";

// Bulk-create users from a parsed CSV (global-admin). Each row is created in the caller's workspace
// and, by default, emailed a set-password invite. Returns a per-row result so the UI can show which
// rows failed (e.g. duplicate email) without aborting the whole import.
export const runtime = "nodejs";

const Body = z.object({
  rows: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().max(120).optional(),
        role: z.enum(["global-admin", "site-admin", "staff"]).default("staff"),
      }),
    )
    .min(1)
    .max(500),
});

export async function POST(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Provide rows with a valid email each (max 500)." }, { status: 400 });

  const { rows } = parsed.data;
  let created = 0;
  const failed: { email: string; error: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const email = row.email.toLowerCase();
    if (seen.has(email)) {
      failed.push({ email, error: "Duplicate row" });
      continue;
    }
    seen.add(email);
    try {
      // Bulk-created users are passwordless; each gets an emailed set-password invite.
      const user = await createUser({ email, name: row.name, role: row.role });
      await sendInvite(req, user, { tenantId: me.tenantId, workspaceName: me.branding?.name ?? undefined, inviter: me.name });
      created++;
    } catch (e) {
      failed.push({ email, error: e instanceof Error && /unique/i.test(e.message) ? "Already exists" : "Could not create" });
    }
  }
  await audit(me.email, "user.import", `${created} created, ${failed.length} skipped`);
  return NextResponse.json({ created, failed });
}
