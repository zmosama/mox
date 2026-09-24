import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { PrefsPatch, readPrefs, TABS, TAB_SLOTS, writePrefs } from "@/lib/prefs";

/** Your preferences, with the tabs there are to choose from. */
export async function GET() {
  const user = await currentUser();
  return NextResponse.json(
    { prefs: readPrefs(user?.id ?? null), tabs: TABS, slots: TAB_SLOTS },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Change any of them; what is left out stays as it was. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = PrefsPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  return NextResponse.json({ prefs: writePrefs(user.id, parsed.data) }, { headers: { "cache-control": "no-store" } });
}
