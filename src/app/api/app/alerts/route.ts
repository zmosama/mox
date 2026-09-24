import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { alerts } from "@/lib/queries";
import { upcomingSessions, WATCH } from "@/lib/f1";

/** What the app turns into notifications: see `alerts` for the shape, plus the
    F1 sessions coming up. `user` lets the phone keep one account's memory of
    it apart from another's. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  // Qualifying, sprint and race start times for the next three weeks. Only the
  // start is sent — never a result — so a notification cannot spoil anything.
  const f1 = await upcomingSessions();
  return NextResponse.json(
    { user: user.id, ...alerts(user.id), f1, f1Watch: WATCH.name },
    { headers: { "cache-control": "no-store" } },
  );
}
