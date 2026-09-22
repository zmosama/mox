/**
 * Every read the pages do. Keeping them here means a page never assembles SQL
 * of its own, and the shape a component receives is declared once.
 *
 * Anything user-specific takes a `userId | null`: the public site renders for
 * nobody in particular, and signing in only swaps in that account's verdicts,
 * follows and taste.
 */
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { TasteModel, type Feature, type RatedTitle, type Scorable } from "./taste";
import type { Feed, MediaKind, Verdict } from "@/db/schema";
import type { ReleaseItem } from "@/components/NewReleases";
import type { Service } from "@/components/ServiceBadge";
import type { CardTitle } from "@/components/TitleCard";
import { addDaysISO, episodeCode, todayISO } from "./dates";

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

/**
 * "EGP 29.99 rent · EGP 99.99 buy", or nothing at all.
 *
 * Silence rather than a placeholder when the price has not been read: a film
 * with no number next to it reads as "not looked up", while "—" or "free"
 * would be a claim about what it costs.
 */
function priceLabel(
  rentCent: number | null,
  buyCent: number | null,
  currency: string | null,
): string | undefined {
  const money = (cent: number) => `${currency ? `${currency} ` : ""}${(cent / 100).toFixed(2)}`;
  const parts: string[] = [];
  if (rentCent != null) parts.push(`${money(rentCent)} rent`);
  if (buyCent != null) parts.push(`${money(buyCent)} buy`);
  return parts.length ? parts.join(" · ") : undefined;
}

// ---------------------------------------------------------------- feeds

/** Feed entries carrying their release date, for the timeline on /new. */
export function datedFeed(name: Feed, userId: number | null, limit = 200): ReleaseItem[] {
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

  const out: ReleaseItem[] = [];
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

/**
 * Episodes that landed on the viewer's services recently, for the same timeline.
 *
 * /new was keyed on release dates alone, so the page answered "what came out"
 * while the question being asked of it was "what can I watch tonight". A show
 * whose new episode dropped this morning last appeared under its premiere date
 * weeks up the page, if the window still reached it at all, and a day on which
 * nothing was newly *released* looked like a day on which nothing happened.
 *
 * One card per show per day, not per episode: a service dropping six at once is
 * one thing to watch, and six identical posters in a row is not a timeline.
 */
export function datedEpisodes(
  userId: number | null,
  today = todayISO(),
  days = 14,
): ReleaseItem[] {
  const from = addDaysISO(today, -days);

  const rows = db
    .select()
    .from(schema.episodes)
    .where(
      and(
        isNotNull(schema.episodes.tmdbId),
        gte(schema.episodes.airs, from),
        lte(schema.episodes.airs, today),
      ),
    )
    .orderBy(desc(schema.episodes.airs), schema.episodes.season, schema.episodes.episode)
    .all();

  const ids = [...new Set(rows.map((r) => r.tmdbId).filter((x): x is number => x !== null))];
  const titles = titlesByIds(ids.map((tmdbId) => ({ tmdbId, kind: "tv" as const })));
  const avail = availabilityFor(ids, userId);
  const lookup = serviceLookup();
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();

  // show + day -> the episodes of it that landed that day, in order.
  const byDay = new Map<string, { tmdbId: number; airs: string; codes: string[] }>();

  for (const r of rows) {
    if (r.tmdbId === null) continue;
    /* Only `hidden` suppresses an episode, which is the calendar's rule rather
       than the feed's. A rated show is *more* interesting here, not less: the
       feed drops what you have already judged because a film you loved is not
       news, but a new episode of a show you love is the best row on the page.
       Copying the feed's test hid Lanterns from its own release morning. */
    if (verdicts.get(key(r.tmdbId, "tv")) === "hidden") continue;

    const slot = `${r.tmdbId}:${r.airs}`;
    const entry = byDay.get(slot) ?? { tmdbId: r.tmdbId, airs: r.airs, codes: [] };
    entry.codes.push(episodeCode(r.season, r.episode));
    byDay.set(slot, entry);
  }

  const out: ReleaseItem[] = [];
  for (const { tmdbId, airs, codes } of byDay.values()) {
    const t = titles.get(key(tmdbId, "tv"));
    if (!t) continue;

    const platforms = (avail.get(key(tmdbId, "tv")) ?? []).map((p) =>
      toService(p.name, lookup, t.title, p.deepLink),
    );
    /* An episode with nowhere to watch it is not news. Unlike `datedFeed` this
       holds for signed-out visitors too: the whole point of the row is that the
       thing is playable now. */
    if (!platforms.length) continue;

    out.push({
      tmdbId,
      kind: "tv",
      title: t.title,
      year: t.year,
      date: airs,
      poster: t.poster,
      rating: t.rating,
      verdict: verdicts.get(key(tmdbId, "tv")) ?? null,
      platforms,
      episodeLabel: codes.length > 1 ? `${codes.length} episodes` : codes[0],
    });
  }
  return out;
}

/**
 * The whole "Available" timeline on /new: what was released, plus what aired.
 *
 * Composed here rather than in the page so the two halves cannot drift into
 * different shapes. A show that premiered today appears in both — the feed
 * because it is new, the episode scan because its first episode aired — so the
 * episode folds into the release rather than sitting next to a copy of itself.
 */
export function newTimeline(userId: number | null, today = todayISO()): ReleaseItem[] {
  const released = datedFeed("new", userId);
  const aired = datedEpisodes(userId, today);

  const seen = new Map(released.map((r) => [`${r.tmdbId}:${r.date}`, r]));
  const extra: ReleaseItem[] = [];

  for (const e of aired) {
    const already = seen.get(`${e.tmdbId}:${e.date}`);
    if (already) already.episodeLabel = e.episodeLabel;
    else extra.push(e);
  }
  return [...released, ...extra];
}

/**
 * Films that have just appeared in a store the viewer uses.
 *
 * The store badge is built from `services` rather than read from
 * `availability`, because these titles are deliberately not in it: rent and buy
 * are excluded from `INCLUDED`, so nothing here claims a film is yours to watch
 * when it is only yours to buy. The section's own heading carries that.
 */
export function newInStore(userId: number | null, today = todayISO(), days = 30): CardTitle[] {
  const from = addDaysISO(today, -days);

  const mine = userId
    ? new Set(
        db
          .select({ providerId: schema.userServices.providerId })
          .from(schema.userServices)
          .where(eq(schema.userServices.userId, userId))
          .all()
          .map((r) => r.providerId),
      )
    : null;

  const rows = db
    .select({
      tmdbId: schema.storeItems.tmdbId,
      providerId: schema.storeItems.providerId,
      firstSeen: schema.storeItems.firstSeen,
      rentCent: schema.storeItems.rentCent,
      buyCent: schema.storeItems.buyCent,
      currency: schema.storeItems.currency,
    })
    .from(schema.storeItems)
    .where(and(gte(schema.storeItems.firstSeen, from), lte(schema.storeItems.firstSeen, today)))
    .orderBy(desc(schema.storeItems.firstSeen))
    .all();

  const titles = titlesByIds(rows.map((r) => ({ tmdbId: r.tmdbId, kind: "movie" as const })));
  const lookup = serviceLookup();
  const byId = new Map(services().map((x) => [x.providerId, x]));
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();

  const out: CardTitle[] = [];
  const seen = new Set<number>();

  for (const r of rows) {
    if (mine && mine.size && !mine.has(r.providerId)) continue;
    if (seen.has(r.tmdbId)) continue;

    const t = titles.get(key(r.tmdbId, "movie"));
    const store = byId.get(r.providerId);
    if (!t || !store) continue;

    /* The feed's rule, not the calendar's: this is a shelf of things to
       discover, so anything already judged drops out. Watchlisted is the
       exception and the best row the section can print — a film you said you
       wanted, now available to buy tonight. */
    const verdict = verdicts.get(key(r.tmdbId, "movie")) ?? null;
    if (verdict && verdict !== "watchlist") continue;

    seen.add(r.tmdbId);
    out.push({
      tmdbId: t.tmdbId,
      kind: "movie",
      title: t.title,
      year: t.year,
      poster: t.poster,
      rating: t.rating,
      verdict,
      platforms: [toService(store.name, lookup, t.title, null)],
      price: priceLabel(r.rentCent, r.buyCent, r.currency),
      arrived: r.firstSeen,
    });
  }

  /* Newest first, and best within a day.
     Sorting the whole month by score read as a leaderboard rather than a
     shelf: the film that turned up this morning is the news, and a four-week
     window sorted by rating buries it under whatever scored highest in
     August. */
  return out.sort(
    (a, b) => (b.arrived ?? "").localeCompare(a.arrived ?? "") || (b.rating ?? 0) - (a.rating ?? 0),
  );
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
