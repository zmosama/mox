import { AGE_LABEL, ageLevel, certAppend, type CertSource } from "@/lib/ratings";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { includedOn, soldOn, type WatchProviders } from "@/lib/providers";
import { APPLE_TV_STORE, serviceLookup, storeOffer } from "@/lib/queries";
import { posterPath, region, tmdb } from "@/lib/tmdb";
import { profileUrl } from "@/lib/people";
import { seriesProgress, type TmdbSeasonSummary } from "@/lib/progress";
import { todayISO } from "@/lib/dates";
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
  seasons?: TmdbSeasonSummary[];
  last_episode_to_air?: { season_number: number; episode_number: number; air_date?: string | null } | null;
  next_episode_to_air?: { season_number: number; episode_number: number; air_date?: string | null } | null;
  genres?: { name: string }[];
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  credits?: {
    cast?: { id: number; name: string; character?: string; profile_path?: string | null }[];
    crew?: { id: number; name: string; job?: string; profile_path?: string | null }[];
  };
  videos?: { results?: { site: string; key: string; type: string; official?: boolean }[] };
  "watch/providers"?: { results?: WatchProviders };
} & CertSource;

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
      append_to_response: `credits,watch/providers,videos,${certAppend(kind)}`,
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
  // Same rules the nightly feed builder applies, so a badge here and a badge on
  // /new can never disagree about what a title streams on.
  const names = includedOn(d["watch/providers"]?.results, chosen, region());

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

  // A series says how far along it is, and how far along you are.
  const progress = kind === "tv"
    ? await seriesProgress(tmdbId, d, user?.id ?? null, todayISO(), undefined, chosen)
    : null;

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
      /** Its age rating, "18+" or "PG", or null when it has none. */
      age: (() => { const l = ageLevel(kind, d); return l ? AGE_LABEL[l] : null; })(),
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
      /* The people, with faces and ids so each opens their own page:
         directors first, then the cast in billing order. */
      people: [
        ...(d.credits?.crew ?? [])
          .filter((c) => c.job === "Director")
          .map((c) => ({ id: c.id, name: c.name, profile: profileUrl(c.profile_path), role: "Director" })),
        ...(d.credits?.cast ?? [])
          .slice(0, 15)
          .map((c) => ({ id: c.id, name: c.name, profile: profileUrl(c.profile_path), role: c.character || "" })),
      ].filter((p, i, all) => all.findIndex((q) => q.id === p.id && q.role === p.role) === i),
      platforms: names.map((name) => {
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
      /* Rent or buy on Apple TV Store, apart from `platforms` on purpose:
         those are included in a subscription, this costs money per film. */
      store: storeOffer(tmdbId, kind, title, soldOn(d["watch/providers"]?.results, region(), APPLE_TV_STORE)),
      verdict,
      following,
      progress,
    },
    // App state must never be reused from the browser's cache: a refresh once
    // redrew a film that had just been dismissed.
    { headers: { "cache-control": "no-store" } },
  );
}
