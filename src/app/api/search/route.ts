import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { availabilityFor, searchLocal, serviceLookup } from "@/lib/queries";
import { posterPath, tmdb } from "@/lib/tmdb";
import type { MediaKind } from "@/db/schema";

type MultiResult = {
  results?: {
    id: number;
    media_type?: string;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
    vote_average?: number;
    vote_count?: number;
  }[];
};

/**
 * Searches the catalog and TMDB together.
 *
 * Searching only what has already been imported meant a show could sit on your
 * calendar and still be unfindable here, which reads as a broken connection
 * rather than a small catalog.
 */
export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const user = await currentUser();
  const local = searchLocal(query, user?.id ?? null, 24);
  const known = new Set(local.map((l) => `${l.tmdbId}:${l.kind}`));

  let remote: MultiResult = {};
  try {
    remote = await tmdb<MultiResult>("/search/multi", { query, include_adult: "false" });
  } catch {
    // TMDB being unreachable should still return what we have locally
  }

  const candidates = (remote.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .filter((r) => !known.has(`${r.id}:${r.media_type}`))
    .slice(0, 24);
  const lookup = serviceLookup();
  const availability = availabilityFor(
    candidates.map((r) => r.id),
    user?.id ?? null,
  );
  const extra = candidates.map((r) => {
      const kind = r.media_type as MediaKind;
      const date = r.release_date ?? r.first_air_date ?? "";
      const title = r.title ?? r.name ?? "Untitled";
      const rows = availability.get(`${r.id}:${kind}`) ?? [];

      return {
        tmdbId: r.id,
        kind,
        title,
        year: date.slice(0, 4) ? Number(date.slice(0, 4)) : null,
        poster: posterPath(r.poster_path),
        rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
        verdict: null,
        platforms: rows.map((row) => {
          const svc = lookup.get(row.name);
          return {
            name: row.name,
            logo: svc?.logo ?? null,
            url: row.deepLink ?? svc?.searchUrl?.replace("{q}", encodeURIComponent(title)) ?? null,
          };
        }),
      };
    });

  return NextResponse.json(
    { results: [...local, ...extra] },
    { headers: { "cache-control": "no-store" } },
  );
}
