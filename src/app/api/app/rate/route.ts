import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ratingWall } from "@/lib/queries";

/** The rating wall from /admin/rate, as data for the app. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // The score only orders the list; it is not the app's business.
  const items = ratingWall(user.id).map((item) => ({
    tmdbId: item.tmdbId,
    kind: item.kind,
    title: item.title,
    year: item.year,
    poster: item.poster,
    verdict: item.verdict,
  }));
  return NextResponse.json({ items }, { headers: { "cache-control": "no-store" } });
}
