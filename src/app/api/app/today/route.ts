import { NextResponse } from "next/server";
import { withBackdrops } from "@/lib/catalog";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { datedFeed, newTimeline } from "@/lib/queries";
import { ageFilter } from "@/lib/age-filter";

/** The /new page as data, for the app's Today tab. */
export async function GET() {
  const user = await currentUser();
  const id = user?.id ?? null;
  const today = todayISO();
  const aged = ageFilter(id);

  return NextResponse.json(
    {
      today,
      available: withBackdrops(await aged(newTimeline(id, today))),
      upcoming: withBackdrops(await aged(datedFeed("upcoming", id))),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
