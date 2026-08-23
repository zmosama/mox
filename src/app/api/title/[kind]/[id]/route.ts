import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { serviceLookup } from "@/lib/queries";
import { posterPath, region, tmdb } from "@/lib/tmdb";
import { MEDIA_KINDS, type MediaKind } from "@/db/schema";

type TmdbTitle = {
  title?: string;
  name?: string;
  tagline?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  genres?: { name: string }[];
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  credits?: { cast?: { name: string }[]; crew?: { name: string; job?: string }[] };
  videos?: { results?: { site: string; key: string; type: string; official?: boolean }[] };
  "watch/providers"?: {
    results?: Record<string, Record<string, { provider_id: number; provider_name: string }[]>>;
  };
};

/** Rent and purchase are not a subscription; only what's included counts. */
const INCLUDED = ["flatrate", "free", "ads"] as const;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind: rawKind, id: rawId } = await ctx.params;
  const kind = rawKind as MediaKind;
  const tmdbId = Number(rawId);

  if (!MEDIA_KINDS.includes(kind) || !Number.isInteger(tmdbId)) {
    return NextResponse.json({ error: "bad title reference" }, { status: 400 });
  }

  let d: TmdbTitle;
  try {
    d = await tmdb<TmdbTitle>(`/${kind}/${tmdbId}`, {
      append_to_response: "credits,watch/providers,videos",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const title = d.title ?? d.name ?? "Untitled";
  const releaseDate = d.release_date ?? d.first_air_date ?? null;
  const user = await currentUser();

  // Prefer an official trailer, then any trailer, then a teaser.
  const videos = (d.videos?.results ?? []).filter((v) => v.site === "YouTube" && v.key);
  const trailer =
    videos.find((v) => v.type === "Trailer" && v.official) ??
    videos.find((v) => v.type === "Trailer") ??
    videos.find((v) => v.type === "Teaser");

  const configured = db.select().from(schema.services).orderBy(schema.services.priority).all();
  const selectedIds = user
    ? new Set(
        db
          .select({ providerId: schema.userServices.providerId })
          .from(schema.userServices)
          .where(eq(schema.userServices.userId, user.id))
          .all()
          .map((row) => row.providerId),
      )
    : null;
  const chosen = selectedIds
    ? configured.filter((service) => selectedIds.has(service.providerId))
    : configured;
  const chosenIds = new Set(chosen.map((s) => s.providerId));
  const regions = d["watch/providers"]?.results ?? {};

  const names = new Set<string>();
  for (const bucket of INCLUDED) {
    for (const p of regions[region()]?.[bucket] ?? []) {
      if (chosenIds.has(p.provider_id)) names.add(p.provider_name);
    }
  }
  // A service not sold locally (Disney+ here) has no entry under our region at
  // all, so it is read from the regions it does exist in.
  for (const svc of chosen) {
    if (names.has(svc.name) || !svc.regions?.length) continue;
    const found = svc.regions.some((r) =>
      INCLUDED.some((bucket) =>
        (regions[r]?.[bucket] ?? []).some((p) => p.provider_id === svc.providerId),
      ),
    );
    if (found) names.add(svc.name);
  }

  const lookup = serviceLookup();
  const links = db
    .select()
    .from(schema.availability)
    .where(and(eq(schema.availability.tmdbId, tmdbId), eq(schema.availability.kind, kind)))
    .all();
  const deepLink = new Map(links.map((l) => [l.provider, l.deepLink]));

  const verdict = user
    ? (db
        .select()
        .from(schema.verdicts)
        .where(
          and(
            eq(schema.verdicts.userId, user.id),
            eq(schema.verdicts.tmdbId, tmdbId),
            eq(schema.verdicts.kind, kind),
          ),
        )
        .get()?.verdict ?? null)
    : null;

  const following = user
    ? Boolean(
        db
          .select()
          .from(schema.follows)
          .where(and(eq(schema.follows.userId, user.id), eq(schema.follows.tmdbId, tmdbId)))
          .get(),
      )
    : false;

  return NextResponse.json(
    {
      tmdbId,
      kind,
      title,
      tagline: d.tagline || null,
      overview: d.overview || null,
      year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
      releaseDate,
      runtime: d.runtime ?? d.episode_run_time?.[0] ?? null,
      seasons: d.number_of_seasons ?? null,
      genres: (d.genres ?? []).map((g) => g.name),
      rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
      poster: posterPath(d.poster_path),
      backdrop: posterPath(d.backdrop_path, "w780"),
      cast: (d.credits?.cast ?? []).slice(0, 6).map((c) => c.name),
      directors: [
        ...new Set(
          (d.credits?.crew ?? [])
            .filter((c) => ["Director", "Screenplay", "Writer"].includes(c.job ?? ""))
            .map((c) => c.name),
        ),
      ].slice(0, 3),
      trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
      platforms: [...names].map((name) => {
        const row = lookup.get(name);
        return {
          name,
          logo: row?.logo ?? null,
          url:
            deepLink.get(name) ??
            row?.searchUrl?.replace("{q}", encodeURIComponent(title)) ??
            null,
        };
      }),
      verdict,
      following,
    },
    // App state must never be reused from the browser's cache: a refresh once
    // redrew a film that had just been dismissed.
    { headers: { "cache-control": "no-store" } },
  );
}
