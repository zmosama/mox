/**
 * The taste model's two nightly jobs: give it something to score, then score it.
 *
 * The model has existed all along and never recommended anything. It scores a
 * title by its features — cast, crew, keywords, studios — and on 1 October 2026
 * only two of the 1,017 titles on Mohammed's services that he had not yet rated
 * had any features at all: the refresh fetched titles and deliberately wrote no
 * features, so everything it could recommend scored as an unknown. A Picks
 * screen built on that would have been empty.
 *
 * So `refreshFeatures` collects features for exactly the titles that could be
 * recommended — those on a service somebody here subscribes to — and drops them
 * again when a title leaves every service and nobody has rated it. That keeps
 * the table the size of the watchable catalogue rather than of everything ever
 * shown.
 *
 * `refreshPicks` builds each person's model once and keeps their best thirty.
 * It runs here, nightly, because building the model reads every rating and
 * every feature, and that is not something to do every time the app opens.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, mapPool, s } from "./shared.mjs";
import { tmdb } from "../../src/lib/tmdb";
import { TasteModel, type Feature, type RatedTitle, type Scorable } from "../../src/lib/taste";
import type { FeatureKind, MediaKind, Verdict } from "../../src/db/schema";

const key = (id: number, kind: string) => `${id}:${kind}`;

/** Titles to collect features for, a night's worth. The rest wait for tomorrow. */
const FEATURES_PER_RUN = Number(process.env.MOX_FEATURES_PER_RUN ?? 400);
/** Picks kept per person. */
const PICKS = 30;
/** Fewer ratings than this and the model is guessing. */
const MIN_RATINGS = 10;
/** A title almost nobody has rated on TMDB is usually not one to recommend. */
const MIN_VOTES = 20;
/** Nor one most people who saw it thought poorly of. */
const MIN_RATING = 6;
/**
 * A film shorter than this is not an evening: the first run's picks were full
 * of ten-minute Marvel One-Shots, making-of documentaries and Disney+ Day
 * specials, which share every cast member with the films and are not films.
 */
const MIN_FILM_MINUTES = 70;
/** So one franchise or one favourite actor cannot take over the list. */
const PER_COLLECTION = 2;
const PER_REASON = 3;
/**
 * Nor cartoons. Disney+ alone carries hundreds, and liking Pixar puts all of
 * them in reach: the second run's thirty had twelve, Ice Age and The Rescuers
 * among them, for someone whose ratings are mostly action.
 */
const FAMILY_MAX = 5;
/**
 * Arabic work is rated by few people on TMDB, so the vote floor that keeps out
 * obscure filler would keep out almost all of it too.
 */
const MIN_VOTES_BY_LANG: Record<string, number> = { ar: 3 };
/**
 * Keywords that describe a mood or a stock character rather than a film.
 * "villain" sits on nearly every cartoon and was the strongest term in half
 * the first list; TMDB's mood tags ("amused", "wistful") are the same problem.
 * Taken out for picking only — the taste page keeps the model as it is.
 */
const PICK_NOISE = new Set([
  "villain", "hero", "cartoon", "amused", "wistful", "admiring", "awestruck", "playful",
  "hopeful", "joyful", "comforting", "sympathetic", "inspirational", "whimsical",
  "exhilarated", "dramatic", "bold", "provocative", "celebratory", "defiant",
  "appreciative", "nostalgic", "adoring", "witty", "lighthearted", "complicated",
  "sentimental", "enthusiastic", "familiar", "tense", "thrilling", "dark",
]);

/** Newer first, gently: a 1961 cartoon should not outrank this year's film. */
function ageFactor(releaseDate: string | null) {
  const y = Number(releaseDate?.slice(0, 4) ?? 0);
  return y >= 2015 ? 1 : y >= 2005 ? 0.85 : y >= 1995 ? 0.7 : 0.5;
}
/** And better first: TMDB's rating, from 0.5 at 6.25 up to 1.25 at 8.1 and above. */
function qualityFactor(rating: number | null) {
  return Math.min(1.25, Math.max(0.5, ((rating ?? 6.5) - 5) / 2.5));
}

/** Services anybody subscribes to; everything, if nobody has chosen yet. */
function watchableServices(): string[] {
  const picked = db
    .selectDistinct({ name: s.services.name })
    .from(s.userServices)
    .innerJoin(s.services, eq(s.services.providerId, s.userServices.providerId))
    .all()
    .map((r) => r.name);
  return picked.length ? picked : db.select({ name: s.services.name }).from(s.services).all().map((r) => r.name);
}

// ------------------------------------------------------------------ features

type Detail = {
  original_language?: string;
  release_date?: string;
  first_air_date?: string;
  genres?: { name: string }[];
  production_companies?: { name: string }[];
  belongs_to_collection?: { name: string } | null;
  created_by?: { name: string }[];
  credits?: { cast?: { name: string; order?: number }[]; crew?: { name: string; job?: string }[] };
  keywords?: { keywords?: { name: string }[]; results?: { name: string }[] };
};

/**
 * The same kinds of feature the legacy import wrote, so old and new titles are
 * scored on one scale: keywords, the leading cast with the people who made it,
 * studios, collection, language, decade and genre.
 */
function featuresOf(d: Detail): Feature[] {
  const out: Feature[] = [];
  const add = (feature: FeatureKind, value: string | undefined | null) => {
    if (value) out.push({ feature, value });
  };
  for (const k of d.keywords?.keywords ?? d.keywords?.results ?? []) add("keyword", k.name);
  for (const c of (d.credits?.cast ?? []).slice(0, 5)) add("person", c.name);
  for (const c of d.credits?.crew ?? []) {
    if (["Director", "Screenplay", "Writer", "Creator"].includes(c.job ?? "")) add("person", c.name);
  }
  for (const c of d.created_by ?? []) add("person", c.name);
  for (const c of (d.production_companies ?? []).slice(0, 3)) add("company", c.name);
  add("collection", d.belongs_to_collection?.name);
  add("lang", d.original_language);
  const year = Number((d.release_date || d.first_air_date || "").slice(0, 4));
  if (year) add("decade", String(Math.floor(year / 10) * 10));
  // Lowercase, as the legacy import wrote them: the model matches features by
  // exact text, and "Action" beside "action" made every new title's genres
  // strangers to everything rated — the first Picks were chosen blind to genre.
  for (const g of d.genres ?? []) add("genre", g.name.toLowerCase());
  return [...new Map(out.map((f) => [`${f.feature}:${f.value}`, f])).values()];
}

export async function refreshFeatures() {
  const services = watchableServices();
  if (!services.length) return "no services";

  /* On a watchable service and without a single feature yet, newest first: a
     title released this week matters more than one from 2011. */
  const missing = db
    .selectDistinct({ tmdbId: s.availability.tmdbId, kind: s.availability.kind })
    .from(s.availability)
    .innerJoin(s.titles, and(eq(s.titles.tmdbId, s.availability.tmdbId), eq(s.titles.kind, s.availability.kind)))
    .where(
      and(
        inArray(s.availability.provider, services),
        sql`not exists (select 1 from features f where f.tmdb_id = ${s.availability.tmdbId} and f.kind = ${s.availability.kind})`,
      ),
    )
    .orderBy(sql`${s.titles.releaseDate} desc`)
    .limit(FEATURES_PER_RUN)
    .all();

  const fetched = await mapPool(missing, 4, async (t) => {
    try {
      const d = await tmdb<Detail>(`/${t.kind}/${t.tmdbId}`, { append_to_response: "keywords,credits" });
      return { ...t, features: featuresOf(d) };
    } catch {
      return null; // tried again tomorrow
    }
  });

  let added = 0;
  db.transaction((tx) => {
    for (const f of fetched) {
      if (!f) continue;
      for (const feat of f.features) {
        tx.insert(s.features)
          .values({ tmdbId: f.tmdbId, kind: f.kind, feature: feat.feature, value: feat.value })
          .onConflictDoNothing()
          .run();
        added++;
      }
    }
  });

  /* Features of a title nobody can watch here any more and nobody has rated
     tell the model nothing it will use. Rated titles keep theirs: they are what
     the model learns from. */
  const pruned = db
    .delete(s.features)
    .where(
      sql`not exists (select 1 from verdicts v where v.tmdb_id = ${s.features.tmdbId} and v.kind = ${s.features.kind})
      and not exists (select 1 from availability a where a.tmdb_id = ${s.features.tmdbId} and a.kind = ${s.features.kind}
                      and a.provider in (${sql.join(services.map((n) => sql`${n}`), sql`, `)}))`,
    )
    .run().changes;

  const left = missing.length === FEATURES_PER_RUN ? ", more tomorrow" : "";
  return `${fetched.filter(Boolean).length} titles given ${added} features, ${pruned} stale features dropped${left}`;
}

// --------------------------------------------------------------------- picks

export async function refreshPicks(today: string) {
  const featureRows = db
    .select({ tmdbId: s.features.tmdbId, kind: s.features.kind, feature: s.features.feature, value: s.features.value })
    .from(s.features)
    .all();
  const features = new Map<string, Feature[]>();
  for (const r of featureRows) {
    if (r.feature === "keyword" && PICK_NOISE.has(r.value)) continue;
    const k = key(r.tmdbId, r.kind);
    (features.get(k) ?? features.set(k, []).get(k)!).push({ feature: r.feature, value: r.value });
  }
  const titles = db.select().from(s.titles).all();
  const corpus: Scorable[] = titles.map((t) => ({ tmdbId: t.tmdbId, features: features.get(key(t.tmdbId, t.kind)) ?? [] }));

  const people = db
    .select({ userId: s.verdicts.userId, n: sql<number>`count(*)` })
    .from(s.verdicts)
    .groupBy(s.verdicts.userId)
    .all()
    .filter((p) => p.n >= MIN_RATINGS);

  const summary: string[] = [];

  for (const { userId } of people) {
    const verdicts = new Map(
      db.select().from(s.verdicts).where(eq(s.verdicts.userId, userId)).all()
        .map((v) => [key(v.tmdbId, v.kind), v.verdict as Verdict]),
    );
    const followed = new Set(
      db.select({ id: s.follows.tmdbId }).from(s.follows).where(eq(s.follows.userId, userId)).all().map((f) => f.id),
    );
    const rated: RatedTitle[] = [];
    for (const t of titles) {
      const v = verdicts.get(key(t.tmdbId, t.kind));
      if (v) rated.push({ tmdbId: t.tmdbId, verdict: v, features: features.get(key(t.tmdbId, t.kind)) ?? [] });
    }
    const model = new TasteModel(rated, corpus);

    // Their services; everything, until they have chosen.
    const mine = db
      .select({ name: s.services.name })
      .from(s.userServices)
      .innerJoin(s.services, eq(s.services.providerId, s.userServices.providerId))
      .where(eq(s.userServices.userId, userId))
      .all()
      .map((r) => r.name);
    const onServices = new Set(
      db.selectDistinct({ tmdbId: s.availability.tmdbId, kind: s.availability.kind })
        .from(s.availability)
        .where(mine.length ? inArray(s.availability.provider, mine) : notInArray(s.availability.provider, [""]))
        .all()
        .map((a) => key(a.tmdbId, a.kind)),
    );

    /* The people a title shares with what they rated well, strongest first —
       "Because you like Denis Villeneuve" when it is true, nothing when not. */
    const loved = model.strongest("person", 3, 50);
    const rank = new Map(loved.map((p, i) => [p.value, i]));

    const scored = titles
      .filter((t) => onServices.has(key(t.tmdbId, t.kind)))
      .filter((t) => !verdicts.has(key(t.tmdbId, t.kind)))
      .filter((t) => !(t.kind === "tv" && followed.has(t.tmdbId)))
      .map((t) => ({ t, f: features.get(key(t.tmdbId, t.kind)) ?? [] }))
      .filter(({ t, f }) => {
        const lang = f.find((x) => x.feature === "lang")?.value ?? "";
        return (t.votes ?? 0) >= (MIN_VOTES_BY_LANG[lang] ?? MIN_VOTES);
      })
      // Children's television is not for this list, whatever the cast.
      .filter(({ f }) => !f.some((x) => x.feature === "genre" && x.value === "kids"))
      .map(({ t, f }) => {
        const best = f
          .filter((x) => x.feature === "person" && rank.has(x.value))
          .sort((a, b) => rank.get(a.value)! - rank.get(b.value)!)[0];
        const family = f.some((x) => x.feature === "genre" && (x.value === "animation" || x.value === "family"));
        const fit = model.score({ tmdbId: t.tmdbId, features: f });
        return {
          t,
          family,
          // Ranked by fit, then by age and quality; only a positive fit counts at all.
          score: fit > 0 ? fit * ageFactor(t.releaseDate) * qualityFactor(t.rating) : fit,
          reason: best ? `Because you like ${best.value}` : null,
        };
      })
      .filter((x) => x.score > 0)
      .filter(({ t }) => t.rating == null || t.rating >= MIN_RATING)
      .filter(({ t }) => t.kind !== "movie" || t.runtime == null || t.runtime >= MIN_FILM_MINUTES)
      .sort((a, b) => b.score - a.score);

    const perCollection = new Map<string, number>();
    const perReason = new Map<string, number>();
    let families = 0;
    const chosen: typeof scored = [];
    for (const x of scored) {
      if (chosen.length >= PICKS) break;
      const c = x.t.collection;
      if (c && (perCollection.get(c) ?? 0) >= PER_COLLECTION) continue;
      if (x.reason && (perReason.get(x.reason) ?? 0) >= PER_REASON) continue;
      if (x.family && families >= FAMILY_MAX) continue;
      if (x.family) families++;
      if (c) perCollection.set(c, (perCollection.get(c) ?? 0) + 1);
      if (x.reason) perReason.set(x.reason, (perReason.get(x.reason) ?? 0) + 1);
      chosen.push(x);
    }

    db.transaction((tx) => {
      tx.delete(s.picks).where(eq(s.picks.userId, userId)).run();
      chosen.forEach(({ t, score, reason }, i) =>
        tx.insert(s.picks)
          .values({ userId, tmdbId: t.tmdbId, kind: t.kind as MediaKind, rank: i, score, reason, builtAt: today })
          .run(),
      );
    });
    summary.push(`#${userId} ${chosen.length}`);
  }

  return summary.length ? `picks for ${summary.join(", ")}` : "nobody has rated enough yet";
}
