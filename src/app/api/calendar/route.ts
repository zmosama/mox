import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { agedEpisodes, ageFilter } from "@/lib/age-filter";
import { monthRange } from "@/lib/dates";
import { calendarBetween } from "@/lib/queries";

/**
 * One month of the TV calendar, past days included — Home's Airing asks for
 * the month before and after the one it opened on.
 *
 *   GET /api/calendar?month=2026-10
 */
export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "month must look like 2026-11" }, { status: 400 });
  }
  const user = await currentUser();
  const id = user?.id ?? null;
  const { from, to } = monthRange(month);
  const episodes = await agedEpisodes(ageFilter(id), calendarBetween(id, from, to));
  return NextResponse.json({ month, episodes }, { headers: { "cache-control": "no-store" } });
}
