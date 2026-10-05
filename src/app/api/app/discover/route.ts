import { playUrl } from "@/lib/play-links";
import { rememberTitles } from "@/lib/catalog";
import { ageFilter } from "@/lib/age-filter";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { includedOn, isStore, type WatchProviders } from "@/lib/providers";
import { serviceLookup, verdictsFor } from "@/lib/queries";
import { posterPath, region, tmdb } from "@/lib/tmdb";
import { clientAddress, takeRequest } from "@/lib/rate-limit";
import type { MediaKind } from "@/db/schema";
import { MOODS } from "@/lib/moods";

type Discover = {
  results?: {
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
    vote_average?: number;
  }[];
};

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mood = MOODS[params.get("mood") ?? ""];
  if (!mood) return NextResponse.json({ error: "unknown mood" }, { status: 400 });

  // Each mood costs TMDB a couple of dozen requests; keep one address from spending the key.
  const limited = takeRequest(`discover:${clientAddress(req)}`, 60, 10 * 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many at once. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  const only = params.get("kind") as MediaKind | null;

  const user = await currentUser();
  const configured = db.select().from(schema.services).orderBy(schema.services.priority).all();
  const picked = user
    ? new Set(
        db
          .select({ providerId: schema.userServices.providerId })
          .from(schema.userServices)
          .where(eq(schema.userServices.userId, user.id))
          .all()
          .map((r) => r.providerId),
      )
    : new Set<number>();
  // Nothing picked yet reads as "every subscription", the same rule as the board.
  const chosen = configured.filter(
    (s) => !isStore(s.providerId) && (picked.size === 0 || picked.has(s.providerId)),
  );
  const verdicts = user ? verdictsFor(user.id) : new Map();
  const lookup = serviceLookup();

  const kinds = (["movie", "tv"] as const).filter((k) => mood[k] !== null && (!only || only === k));

  const lists = await Promise.all(
    kinds.map(async (kind) => {
      try {
        const res = await tmdb<Discover>(`/discover/${kind}`, {
          with_genres: mood[kind]!,
          watch_region: region(),
          with_watch_providers: chosen.map((s) => s.providerId).join("|"),
          with_watch_monetization_types: "flatrate|free|ads",
          sort_by: "popularity.desc",
          "vote_count.gte": 50,
          include_adult: "false",
        });
        return (res.results ?? []).map((r) => ({ ...r, kind }));
      } catch {
        return [];
      }
    }),
  );

  rememberTitles(lists.flat().map((r) => ({ item: r, kind: r.kind })));

  // Alternate films and shows so neither buries the other.
  const merged: (NonNullable<Discover["results"]>[number] & { kind: MediaKind })[] = [];
  for (let i = 0; i < 20; i++) for (const list of lists) if (list[i]) merged.push(list[i]);

  const fresh = merged.filter((r) => {
    const v = verdicts.get(`${r.id}:${r.kind}`);
    return !v || v === "watchlist";
  });

  const results = await Promise.all(
    fresh.slice(0, 24).map(async (r) => {
      const title = r.title ?? r.name ?? "Untitled";
      let names: string[] = [];
      try {
        const wp = await tmdb<{ results?: WatchProviders }>(`/${r.kind}/${r.id}/watch/providers`);
        names = includedOn(wp.results, chosen, region());
      } catch {
        // a missing badge is better than a missing title
      }
      const date = r.release_date ?? r.first_air_date ?? "";
      return {
        tmdbId: r.id,
        kind: r.kind,
        title,
        year: date ? Number(date.slice(0, 4)) : null,
        poster: posterPath(r.poster_path),
        rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
        verdict: verdicts.get(`${r.id}:${r.kind}`) ?? null,
        platforms: names.map((name) => {
          const row = lookup.get(name);
          return {
            name,
            logo: row?.logo ?? null,
            url: playUrl(row?.providerId, title),
          };
        }),
      };
    }),
  );

  const aged = await ageFilter(user?.id ?? null)(results, { lookUp: true });
  return NextResponse.json({ results: aged }, { headers: { "cache-control": "no-store" } });
}
