import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { f1Board } from "@/lib/f1";
import { readPrefs } from "@/lib/prefs";

/** The F1 tab: next weekend, the calendar, results and standings behind the shield. */
export async function GET() {
  const user = await currentUser();
  // Signed out there is no "I've watched it" to press, so nothing is shielded.
  const shield = user ? readPrefs(user.id).f1Shield : false;
  try {
    return NextResponse.json(await f1Board(user?.id ?? null, shield), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "The F1 calendar could not be reached." }, { status: 502 });
  }
}
