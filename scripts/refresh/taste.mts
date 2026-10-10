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
import { and, eq, inArray, sql } from "drizzle-orm";
import { catalogue, db, fetchTitle, mapPool, s, saveTitle, type Detail as TitleDetail } from "./shared.mjs";
import { tmdb } from "../../src/lib/tmdb";
import { type Feature } from "../../src/lib/taste";
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
const FAMILY_MAX = 3;
/**
 * Arabic work is rated by few people on TMDB, so the vote floor that keeps out
 * obscure filler would keep out almost all of it too.
 */
const MIN_VOTES_BY_LANG: Record<string, number> = { ar: 3 };
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

/**
 * How much each verdict pulls on what it recommends. Dislikes and hidden
 * titles push away what they recommend, so a loved superhero film and a
 * disliked one cancel out on the cartoon they both suggest.
 */
const PULL: Partial<Record<Verdict, number>> = { love: 2, like: 1, watchlist: 0.5, seen: 0.3, dislike: -1.5, hidden: -1 };
/** How many of the best-recommended get looked up for where they stream. */
const SHORTLIST = 200;

type Rec = { id: number; media_type?: string; original_language?: string };

/** TMDB's "if you liked this" list for one title, kept a week in the disk cache. */
async function recommendations(kind: MediaKind, tmdbId: number): Promise<Rec[]> {
  try {
    const body = await tmdb<{ results?: Rec[] }>(`/${kind}/${tmdbId}/recommendations`);
    return body.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Picks, from what the titles you rated recommend.
 *
 * The feature model this replaced learned almost nothing from Mohammed's
 * ratings — 231 loves against 23 dislikes leave little to tell apart — and
 * filled the list on a shared keyword or studio: Tinker Bell, a dog film, a
 * cooking contest, for someone who loves Mr. Robot, The Boys and The Expanse.
 *
 * TMDB's recommendations are built from what people actually watch together.
 * A title recommended by fifteen of your loves is the strongest pick there
 * is; one none of them recommends never appears. Each candidate's score is
 * the sum of its pulls, higher in the source's list counting more. The best
 * are then looked up for where they stream, so the list is not limited to
 * the titles MOX already tracks; the thirty chosen are saved as titles so
 * every screen can show them.
 */
export async function refreshPicks(today: string) {
  const people = db
    .select({ userId: s.verdicts.userId, n: sql<number>`count(*)` })
    .from(s.verdicts)
    .groupBy(s.verdicts.userId)
    .all()
    .filter((p) => p.n >= MIN_RATINGS);
  const services = catalogue();
  const summary: string[] = [];

  for (const { userId } of people) {
    const rated = db.select().from(s.verdicts).where(eq(s.verdicts.userId, userId)).all();
    const judged = new Set(rated.map((v) => key(v.tmdbId, v.kind)));
    const followed = new Set(
      db.select({ id: s.follows.tmdbId }).from(s.follows).where(eq(s.follows.userId, userId)).all().map((f) => f.id),
    );
    const names = new Map(db.select({ tmdbId: s.titles.tmdbId, kind: s.titles.kind, title: s.titles.title }).from(s.titles).all()
      .map((t) => [key(t.tmdbId, t.kind), t.title]));

    const sources = rated.filter((v) => PULL[v.verdict as Verdict]);
    const lists = await mapPool(sources, 6, (v) => recommendations(v.kind as MediaKind, v.tmdbId));
    const arabic = new Set(db.select({ tmdbId: s.titles.tmdbId, kind: s.titles.kind }).from(s.titles).where(eq(s.titles.lang, "ar")).all()
      .map((t) => key(t.tmdbId, t.kind)));

    const pull = new Map<string, { id: number; kind: MediaKind; score: number; because: Map<string, number> }>();
    sources.forEach((v, i) => {
      const w = PULL[v.verdict as Verdict]!;
      /* Few people watch Arabic work on TMDB, so what it recommends for an
         Egyptian series is whatever is popular: "لعبة نيوتن" recommended a
         Netflix teen romance. From Arabic work, only Arabic work counts. */
      const fromArabic = arabic.has(key(v.tmdbId, v.kind));
      lists[i].filter((r) => !fromArabic || r.original_language === "ar").forEach((r, rank) => {
        const kind = (r.media_type === "tv" ? "tv" : r.media_type === "movie" ? "movie" : v.kind) as MediaKind;
        const k = key(r.id, kind);
        if (judged.has(k) || (kind === "tv" && followed.has(r.id))) return;
        const add = w * (1 - rank / 40);
        const c = pull.get(k) ?? pull.set(k, { id: r.id, kind, score: 0, because: new Map() }).get(k)!;
        c.score += add;
        const from = names.get(key(v.tmdbId, v.kind));
        if (from && add > 0) c.because.set(from, (c.because.get(from) ?? 0) + add);
      });
    });

    const shortlist = [...pull.values()].filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, SHORTLIST);

    // Their services; everything, until they have chosen.
    const mine = new Set(
      db.select({ name: s.services.name })
        .from(s.userServices)
        .innerJoin(s.services, eq(s.services.providerId, s.userServices.providerId))
        .where(eq(s.userServices.userId, userId))
        .all()
        .map((r) => r.name),
    );
    const fetched = await mapPool(shortlist, 6, (c) => fetchTitle(c.id, c.kind, services));

    const scored = shortlist.flatMap((c, i) => {
      const f = fetched[i];
      if (!f) return [];
      const d = f.detail as TitleDetail & { genres?: { name: string }[] };
      if (!f.platforms.some((p) => !mine.size || mine.has(p))) return [];
      const genres = (d.genres ?? []).map((g) => g.name.toLowerCase());
      // Children's television is not for this list, whatever recommends it.
      if (genres.includes("kids")) return [];
      const lang = d.original_language ?? "";
      if ((d.vote_count ?? 0) < (MIN_VOTES_BY_LANG[lang] ?? MIN_VOTES)) return [];
      if (d.vote_average != null && d.vote_average < MIN_RATING) return [];
      const runtime = d.runtime ?? null;
      if (c.kind === "movie" && runtime != null && runtime < MIN_FILM_MINUTES) return [];
      const because = [...c.because].sort((a, b) => b[1] - a[1])[0]?.[0];
      return [{
        f,
        collection: d.belongs_to_collection?.name ?? null,
        family: genres.includes("animation") || genres.includes("family"),
        score: c.score * ageFactor(d.release_date || d.first_air_date || null) * qualityFactor(d.vote_average ?? null),
        reason: because ? `Because you liked ${because}` : null,
      }];
    }).sort((a, b) => b.score - a.score);

    const perCollection = new Map<string, number>();
    const perReason = new Map<string, number>();
    let families = 0;
    const chosen: typeof scored = [];
    for (const x of scored) {
      if (chosen.length >= PICKS) break;
      const c = x.collection;
      if (c && (perCollection.get(c) ?? 0) >= PER_COLLECTION) continue;
      if (x.reason && (perReason.get(x.reason) ?? 0) >= PER_REASON) continue;
      if (x.family && families >= FAMILY_MAX) continue;
      if (x.family) families++;
      if (c) perCollection.set(c, (perCollection.get(c) ?? 0) + 1);
      if (x.reason) perReason.set(x.reason, (perReason.get(x.reason) ?? 0) + 1);
      chosen.push(x);
    }
    // An empty answer is never written: a bad night keeps yesterday's picks.
    if (!chosen.length) continue;

    db.transaction((tx) => {
      for (const { f } of chosen) saveTitle(tx, f);
      tx.delete(s.picks).where(eq(s.picks.userId, userId)).run();
      chosen.forEach(({ f, score, reason }, i) =>
        tx.insert(s.picks)
          .values({ userId, tmdbId: f.tmdbId, kind: f.kind, rank: i, score, reason, builtAt: today })
          .run(),
      );
    });
    summary.push(`#${userId} ${chosen.length} of ${pull.size} recommended`);
  }

  return summary.length ? `picks for ${summary.join(", ")}` : "nobody has rated enough yet";
}
