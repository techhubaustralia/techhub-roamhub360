import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { getUserPrefs, updateUserPrefs } from "@/lib/server/users";
import { z } from "zod";

// Self-service preferences for the signed-in user (Team Build-Up C privacy + D notifications).
// Identity comes from the session; a user can only read/write their OWN preferences.

export async function GET() {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await getUserPrefs(me.email));
}

const PrefsPatch = z.object({
  hidePresence: z.boolean().optional(),
  notifyPresence: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Preferences require a database." }, { status: 503 });
  const parsed = PrefsPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await updateUserPrefs(me.email, parsed.data);
  return NextResponse.json(await getUserPrefs(me.email));
}
