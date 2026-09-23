import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { library } from "@/lib/queries";
import { followedPeople, peopleYouLove } from "@/lib/people";

/** The app's My List tab: shows you follow, then what you said you want to watch. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ following: [], watchlist: [], people: [], loved: [] });
  return NextResponse.json(
    { ...library(user.id), people: followedPeople(user.id), loved: await peopleYouLove(user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
