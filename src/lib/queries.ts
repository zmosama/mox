/**
 * Every read the pages do. Keeping them here means a page never assembles SQL
 * of its own, and the shape a component receives is declared once.
 *
 * Anything user-specific takes a `userId | null`: the public site renders for
 * nobody in particular, and signing in only swaps in that account's verdicts,
 * follows and taste.
 */
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { TasteModel, type Feature, type RatedTitle, type Scorable } from "./taste";
import type { Feed, MediaKind, Verdict } from "@/db/schema";
import type { Service } from "@/components/ServiceBadge";
import type { CardTitle } from "@/components/TitleCard";
import { addDaysISO, todayISO } from "./dates";

const key = (tmdbId: number, kind: MediaKind) => `${tmdbId}:${kind}`;

// ---------------------------------------------------------------- services

export type ServiceRow = {
  providerId: number;
  name: string;
  logo: string | null;
  searchUrl: string | null;
};

export function services(): ServiceRow[] {
  return db
    .select({
      providerId: schema.services.providerId,
      name: schema.services.name,
      logo: schema.services.logo,
      searchUrl: schema.services.searchUrl,
    })
    .from(schema.services)
    .all();
}

/** Logos answer to both spellings: TMDB says "Disney Plus", the config "Disney+". */
export function serviceLookup() {
  const rows = services();
  const byName = new Map<string, ServiceRow>();
  for (const r of rows) byName.set(r.name, r);
  return byName;
}

function toService(
  name: string,
  lookup: Map<string, ServiceRow>,
  title: string,
  deepLink: string | null,
): Service {
  const row = lookup.get(name);
  const search = row?.searchUrl?.replace("{q}", encodeURIComponent(title)) ?? null;
  return { name, logo: row?.logo ?? null, url: deepLink ?? search };
}

// ---------------------------------------------------------------- viewer

export type Viewer = { id: number } | null;

export function verdictsFor(userId: number) {
  const rows = db
    .select()
    .from(schema.verdicts)
    .where(eq(schema.verdicts.userId, userId))
    .all();
  return new Map(rows.map((r) => [key(r.tmdbId, r.kind), r.verdict as Verdict]));
}

export function followsFor(userId: number): Set<number> {
  const rows = db
    .select({ tmdbId: schema.follows.tmdbId })
    .from(schema.follows)
    .where(eq(schema.follows.userId, userId))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

// ---------------------------------------------------------------- features

export function featuresByTitle(): Map<string, Feature[]> {
  const rows = db
    .select({
      tmdbId: schema.features.tmdbId,
      kind: schema.features.kind,
      feature: schema.features.feature,
      value: schema.features.value,
    })
    .from(schema.features)
    .all();

  const out = new Map<string, Feature[]>();
  for (const r of rows) {
    const k = key(r.tmdbId, r.kind);
    const list = out.get(k) ?? [];
    list.push({ feature: r.feature, value: r.value });
    out.set(k, list);
  }
  return out;
}

/** The taste model for one viewer. Returns null when nobody is signed in. */
export function tasteFor(userId: number | null): TasteModel | null {
  if (!userId) return null;

  const feats = featuresByTitle();
  const titles = db
    .select({ tmdbId: schema.titles.tmdbId, kind: schema.titles.kind })
    .from(schema.titles)
    .all();

  const corpus: Scorable[] = titles.map((t) => ({
    tmdbId: t.tmdbId,
    features: feats.get(key(t.tmdbId, t.kind)) ?? [],
  }));

  const verdicts = verdictsFor(userId);
  const rated: RatedTitle[] = [];
  for (const t of titles) {
    const verdict = verdicts.get(key(t.tmdbId, t.kind));
    if (verdict) {
      rated.push({ tmdbId: t.tmdbId, verdict, features: feats.get(key(t.tmdbId, t.kind)) ?? [] });
    }
  }
  return new TasteModel(rated, corpus);
}

// ---------------------------------------------------------------- titles

type TitleRow = typeof schema.titles.$inferSelect;

export function titlesByIds(ids: { tmdbId: number; kind: MediaKind }[]): Map<string, TitleRow> {
  if (!ids.length) return new Map();
  const rows = db
    .select()
    .from(schema.titles)
    .where(inArray(schema.titles.tmdbId, ids.map((i) => i.tmdbId)))
    .all();
  return new Map(rows.map((r) => [key(r.tmdbId, r.kind), r]));
}

/**
 * Availability on the viewer's selected services.
 *
 * Signed-out visitors see the install's complete service catalogue. A signed-in
 * viewer sees only providers they selected in `user_services`; the legacy
 * `availability.mine` flag is deliberately not consulted anymore.
 */
export function availabilityFor(ids: number[], userId: number | null) {
  if (!ids.length) return new Map<string, { name: string; deepLink: string | null }[]>();
  const rows = db
    .select({
      tmdbId: schema.availability.tmdbId,
      kind: schema.availability.kind,
      provider: schema.availability.provider,
      providerId: schema.services.providerId,
      deepLink: schema.availability.deepLink,
    })
    .from(schema.availability)
    .innerJoin(schema.services, eq(schema.availability.provider, schema.services.name))
    .where(inArray(schema.availability.tmdbId, ids))
    .all();

  /**
   * An empty selection means "not told yet", not "subscribes to nothing".
   *
   * Filtering on it literally emptied the whole app for every account but the
   * owner's — the board, the calendar and /new all went blank the moment
   * somebody signed in. Someone who has not picked yet sees what a signed-out
   * visitor sees, and the board nudges them to choose.
   */
  const picked = userId === null
    ? []
    : db
        .select({ providerId: schema.userServices.providerId })
        .from(schema.userServices)
        .where(eq(schema.userServices.userId, userId))
        .all()
        .map((r) => r.providerId);

  const selected = picked.length ? new Set(picked) : null;

  const out = new Map<string, { name: string; deepLink: string | null }[]>();
  for (const r of rows) {
    if (selected && !selected.has(r.providerId)) continue;
    const k = key(r.tmdbId, r.kind);
    const list = out.get(k) ?? [];
    // A fallback provider can be present in more than one region. It is still
    // one service to the viewer, so keep the best link rather than duplicating.
    const existing = list.find((p) => p.name === r.provider);
    if (!existing) list.push({ name: r.provider, deepLink: r.deepLink });
    else if (!existing.deepLink && r.deepLink) existing.deepLink = r.deepLink;
    out.set(k, list);
  }
  return out;
}

// ---------------------------------------------------------------- feeds

/** Feed entries carrying their release date, for the timeline on /new. */
export function datedFeed(name: Feed, userId: number | null, limit = 200) {
  const rows = db
    .select({ tmdbId: schema.feedItems.tmdbId, kind: schema.feedItems.kind })
    .from(schema.feedItems)
    .where(eq(schema.feedItems.feed, name))
    .orderBy(schema.feedItems.position)
    .all();

  const titles = titlesByIds(rows);
  const avail = availabilityFor(rows.map((r) => r.tmdbId), userId);
  const lookup = serviceLookup();
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();

  const out = [];
  for (const r of rows) {
    const t = titles.get(key(r.tmdbId, r.kind));
    if (!t) continue;
    const verdict = verdicts.get(key(r.tmdbId, r.kind)) ?? null;
    if (verdict && verdict !== "watchlist") continue;
    const platforms = (avail.get(key(r.tmdbId, r.kind)) ?? []).map((p) =>
      toService(p.name, lookup, t.title, p.deepLink),
    );
    if (userId !== null && platforms.length === 0) continue;
    out.push({
      tmdbId: t.tmdbId,
      kind: t.kind,
      title: t.title,
      year: t.year,
      date: t.releaseDate ?? "",
      poster: t.poster,
      rating: t.rating,
      verdict,
      platforms,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function feed(name: Feed, userId: number | null, limit = 60): CardTitle[] {
  const rows = db
    .select({
      tmdbId: schema.feedItems.tmdbId,
      kind: schema.feedItems.kind,
      position: schema.feedItems.position,
    })
    .from(schema.feedItems)
    .where(eq(schema.feedItems.feed, name))
    .orderBy(schema.feedItems.position)
    .all();

  const titles = titlesByIds(rows);
  const avail = availabilityFor(rows.map((r) => r.tmdbId), userId);
  const lookup = serviceLookup();
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();

  const out: CardTitle[] = [];
  for (const r of rows) {
    const t = titles.get(key(r.tmdbId, r.kind));
    if (!t) continue;
    const verdict = verdicts.get(key(r.tmdbId, r.kind)) ?? null;
    // A decision already made takes it out of the queue; "want to watch" stays,
    // because that decision was "yes, later".
    if (verdict && verdict !== "watchlist") continue;
    const platforms = (avail.get(key(r.tmdbId, r.kind)) ?? []).map((p) =>
      toService(p.name, lookup, t.title, p.deepLink),
    );
    if (userId !== null && platforms.length === 0) continue;

    out.push({
      tmdbId: t.tmdbId,
      kind: t.kind,
      title: t.title,
      year: t.year,
      poster: t.poster,
      rating: t.rating,
      verdict,
      platforms,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------- calendar

export type CalendarEpisode = {
  show: string;
  tmdbId: number | null;
  season: number;
  episode: number;
  airs: string;
  poster: string | null;
  following: boolean;
  platforms: Service[];
};

export function calendar(userId: number | null, days = 14): CalendarEpisode[] {
  const today = todayISO();
  const horizon = addDaysISO(today, days);

  const rows = db
    .select()
    .from(schema.episodes)
    .where(and(gte(schema.episodes.airs, today), lte(schema.episodes.airs, horizon)))
    .orderBy(schema.episodes.airs)
    .all();

  const ids = [...new Set(rows.map((r) => r.tmdbId).filter((x): x is number => x !== null))];
  const titles = titlesByIds(ids.map((tmdbId) => ({ tmdbId, kind: "tv" as const })));
  const avail = availabilityFor(ids, userId);
  const lookup = serviceLookup();
  const follows = userId ? followsFor(userId) : new Set<number>();
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();

  return rows
    .filter((r) => !r.tmdbId || verdicts.get(key(r.tmdbId, "tv")) !== "hidden")
    .map((r) => {
      const t = r.tmdbId ? titles.get(key(r.tmdbId, "tv")) : undefined;
      return {
        show: r.show,
        tmdbId: r.tmdbId,
        season: r.season,
        episode: r.episode,
        airs: r.airs,
        poster: t?.poster ?? null,
        following: r.tmdbId ? follows.has(r.tmdbId) : false,
        platforms: (r.tmdbId ? (avail.get(key(r.tmdbId, "tv")) ?? []) : []).map((p) =>
          toService(p.name, lookup, r.show, p.deepLink),
        ),
      };
    });
}

// ---------------------------------------------------------------- rating wall

/**
 * Everything to rate, ordered so the titles you are most likely to have seen
 * come first — otherwise you scroll past three hundred posters looking for one
 * you recognise.
 */
export function ratingWall(userId: number) {
  const feats = featuresByTitle();
  const model = tasteFor(userId);
  const verdicts = verdictsFor(userId);

  const rows = db.select().from(schema.titles).all();
  const scored = rows.map((t) => ({
    tmdbId: t.tmdbId,
    kind: t.kind,
    title: t.title,
    year: t.year,
    poster: t.poster,
    rating: t.rating,
    lang: t.lang,
    verdict: verdicts.get(key(t.tmdbId, t.kind)) ?? null,
    score: model
      ? model.score({ tmdbId: t.tmdbId, features: feats.get(key(t.tmdbId, t.kind)) ?? [] })
      : 0,
  }));

  return scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function stats(userId: number) {
  const rows = db
    .select({ verdict: schema.verdicts.verdict, n: sql<number>`count(*)` })
    .from(schema.verdicts)
    .where(eq(schema.verdicts.userId, userId))
    .groupBy(schema.verdicts.verdict)
    .all();
  const counts = Object.fromEntries(rows.map((r) => [r.verdict, r.n])) as Record<Verdict, number>;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.titles).get()?.n ?? 0;
  return { counts, rated: rows.reduce((a, r) => a + r.n, 0), total };
}

// ---------------------------------------------------------------- universes

/**
 * Biggest universe first.
 *
 * These were ordered by name, which put "Marvel Cinematic Universe" fifth of
 * six — off the end of the chip strip on a phone, with the page opening on
 * "DC Animated Universe" and its sixteen titles. The largest universe is the
 * one worth landing on, and it is the one you would notice was missing.
 */
const SIZE = sql<number>`(
  select count(*) from ${schema.universeTitles}
  where ${schema.universeTitles.slug} = ${schema.universes.slug}
)`;

export function universeList() {
  return db
    .select({
      slug: schema.universes.slug,
      name: schema.universes.name,
      keyword: schema.universes.keyword,
      company: schema.universes.company,
      size: SIZE,
    })
    .from(schema.universes)
    // The expression again, not the `size` alias: SQLite rejects an alias from
    // the select list here, and the failure is at runtime, not compile time.
    .orderBy(desc(SIZE), schema.universes.name)
    .all();
}

export function universeTitles(slug: string, userId: number | null) {
  const rows = db
    .select()
    .from(schema.universeTitles)
    .where(eq(schema.universeTitles.slug, slug))
    .all();

  const titles = titlesByIds(rows);
  const avail = availabilityFor(rows.map((r) => r.tmdbId), userId);
  const lookup = serviceLookup();
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();
  // Cairo, not UTC. `toISOString()` here meant that between midnight and 2am
  // local a film released today still rendered as "upcoming".
  const today = todayISO();

  return rows
    .map((r) => {
      const t = titles.get(key(r.tmdbId, r.kind));
      if (!t) return null;
      return {
        tmdbId: t.tmdbId,
        kind: t.kind,
        title: t.title,
        year: t.year,
        date: t.releaseDate ?? "",
        poster: t.poster,
        rating: t.rating,
        verdict: verdicts.get(key(t.tmdbId, t.kind)) ?? null,
        upcoming: (t.releaseDate ?? "") > today,
        platforms: (avail.get(key(t.tmdbId, t.kind)) ?? []).map((p) =>
          toService(p.name, lookup, t.title, p.deepLink),
        ),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------- search

export function searchLocal(query: string, userId: number | null, limit = 40): CardTitle[] {
  const q = `%${query.trim().toLowerCase()}%`;
  const rows = db
    .select()
    .from(schema.titles)
    .where(sql`lower(${schema.titles.title}) like ${q}`)
    .orderBy(desc(schema.titles.votes))
    .limit(limit)
    .all();

  const avail = availabilityFor(rows.map((r) => r.tmdbId), userId);
  const lookup = serviceLookup();
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();

  return rows.map((t) => ({
    tmdbId: t.tmdbId,
    kind: t.kind,
    title: t.title,
    year: t.year,
    poster: t.poster,
    rating: t.rating,
    verdict: verdicts.get(key(t.tmdbId, t.kind)) ?? null,
    platforms: (avail.get(key(t.tmdbId, t.kind)) ?? []).map((p) =>
      toService(p.name, lookup, t.title, p.deepLink),
    ),
  }));
}
