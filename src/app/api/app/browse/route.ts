import { NextResponse } from "next/server";
import { MOODS, MOOD_LABELS } from "@/lib/moods";
import { region, tmdb } from "@/lib/tmdb";

type Discover = { results?: { backdrop_path?: string | null; vote_count?: number }[] };

/**
 * The iPad's Browse tiles: each mood with a picture, taken from the most
 * popular well-known film in it this week. One discover request per mood,
 * cached on disk for hours — opening Search costs TMDB nothing most of the time.
 */
export async function GET() {
  const moods = await Promise.all(
    Object.entries(MOODS).map(async ([id, genres]) => {
      let image: string | null = null;
      try {
        const kind = genres.movie !== null ? "movie" : "tv";
        const res = await tmdb<Discover>(`/discover/${kind}`, {
          with_genres: (genres.movie ?? genres.tv)!,
          sort_by: "popularity.desc",
          "vote_count.gte": 500,
          watch_region: region(),
          include_adult: "false",
        });
        const pick = (res.results ?? []).find((r) => r.backdrop_path);
        image = pick ? `https://image.tmdb.org/t/p/w780${pick.backdrop_path}` : null;
      } catch {
        // A tile without a picture still works.
      }
      return { id, label: MOOD_LABELS[id as keyof typeof MOOD_LABELS], image };
    }),
  );
  return NextResponse.json({ moods }, { headers: { "cache-control": "no-store" } });
}
