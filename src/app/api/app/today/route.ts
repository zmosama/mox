import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { datedFeed, newTimeline } from "@/lib/queries";

/** The /new page as data, for the app's Today tab. */
export async function GET() {
  const user = await currentUser();
  const id = user?.id ?? null;
  const today = todayISO();

  return NextResponse.json(
    { today, available: newTimeline(id, today), upcoming: datedFeed("upcoming", id) },
    { headers: { "cache-control": "no-store" } },
  );
}
