import { NextResponse } from "next/server";
import { withBackdrops } from "@/lib/catalog";
import { currentUser } from "@/lib/auth";
import { ageFilter } from "@/lib/age-filter";
import { picksFor } from "@/lib/queries";

/** The app's Picks tab. Built nightly by the refresh; this only reads it. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ picks: [] });
  return NextResponse.json(
    { picks: withBackdrops(await ageFilter(user.id)(picksFor(user.id))) },
    { headers: { "cache-control": "no-store" } },
  );
}
