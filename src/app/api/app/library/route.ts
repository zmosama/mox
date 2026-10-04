import { NextResponse } from "next/server";
import { withBackdrops } from "@/lib/catalog";

const wide = <L extends { following: Parameters<typeof withBackdrops>[0]; watchlist: Parameters<typeof withBackdrops>[0] }>(l: L) => ({
  following: withBackdrops(l.following),
  watchlist: withBackdrops(l.watchlist),
});
import { currentUser } from "@/lib/auth";
import { agedLibrary } from "@/lib/age-filter";
import { followedPeople, peopleYouLove, within } from "@/lib/people";

/** The app's My List tab: shows you follow, then what you said you want to watch. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ following: [], watchlist: [], people: [], loved: [] });
  return NextResponse.json(
    { ...wide(await agedLibrary(user.id)), people: followedPeople(user.id), loved: await within(2500, peopleYouLove(user.id), []) },
    { headers: { "cache-control": "no-store" } },
  );
}
