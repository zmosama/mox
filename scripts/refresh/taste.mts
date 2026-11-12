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
const MIN_VOTES = 50;
/**
 * Nor one most people who saw it thought poorly of. Only a floor: a 6.5 that
 * fits your ratings is still a pick, and TMDB's rating already moves titles up
 * and down the list (qualityFactor).
 */
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
 * Nor superheroes. Rate a lot of Marvel and every list TMDB has for you is
 * more of it: ten of thirty were caped (Titans, Stargirl, The Gifted, Gen V…),
 * crowding out everything else your ratings point at. They stay, a few.
 */
const CAPED_MAX = 6;
const CAPED = new Set(["superhero", "superhero team", "based on comic", "marvel comics", "dc comics", "marvel cinematic universe (mcu)", "dc extended universe (dceu)"]);
/** How many of the best candidates are checked for being superhero work. */
const KEYWORD_CHECKS = 90;
/**
 * Arabic work is rated by few people on TMDB, so the vote floor that keeps out
 * obscure filler would keep out almost all of it too.
 */
const MIN_VOTES_BY_LANG: Record<string, number> = { ar: 3 };
/**
 * Newer first, gently. Old work stays very much in: an older series you never
 * got to, or one worth going back to (Lost, Person of Interest), is as good a
 * pick as this year's — it only gives way to a newer one that fits as well.
 */
function ageFactor(releaseDate: string | null) {
  const y = Number(releaseDate?.slice(0, 4) ?? 0);
  return y >= 2015 ? 1 : y >= 2005 ? 0.85 : y >= 1995 ? 0.7 : 0.5;
}
/**
 * The best-known titles turn up in nearly every "people also liked" list, so a
 * plain sum ranks them first for anybody — that is how a Marvel fan got eight
 * superhero shows. Each title's score is damped by how widely known it is, so
 * agreement among your favourites counts for more than sheer popularity.
 */
function fameFactor(votes: number) {
  return 1 / (1 + Math.log10(Math.max(1, votes / 300)));
}
/**
 * And better first, by a curve rather than a cutoff: 6.0 counts 0.16, 7.0
 * 0.64, 7.5 1, 8.3 and above 1.6. A plain straight line let Justice League
 * (6.1) lead the list on the strength of how many superhero films point at
 * it; squared, a weaker title needs far more of your favourites behind it,
 * and still makes it when it truly fits.
 */
function qualityFactor(rating: number | null) {
  const r = rating ?? 6.8;
  return Math.min(1.6, Math.max(0.05, ((r - 5) / 2.5) ** 2));
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
  /* Only accounts that still exist: ratings left behind by a deleted account
     have nobody to write picks for, and the foreign key refusing the write
     stopped the whole run for everybody after them. */
  const people = db
    .select({ userId: s.verdicts.userId, n: sql<number>`count(*)` })
    .from(s.verdicts)
    .innerJoin(s.users, eq(s.users.id, s.verdicts.userId))
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
      // Children's television is not for this list, whatever recommends it,
      // and nor are making-of documentaries ("Marvel Studios Legends") or
      // reality and talk shows that share a cast with what you loved.
      if (["kids", "documentary", "reality", "talk", "news"].some((g) => genres.includes(g))) return [];
      const lang = d.original_language ?? "";
      if ((d.vote_count ?? 0) < (MIN_VOTES_BY_LANG[lang] ?? MIN_VOTES)) return [];
      if (d.vote_average != null && d.vote_average < MIN_RATING) return [];
      const runtime = d.runtime ?? null;
      if (c.kind === "movie" && runtime != null && runtime < MIN_FILM_MINUTES) return [];
      const released = d.release_date || d.first_air_date || null;
      // The two favourites that pull hardest, so the reason reads as the reason.
      const because = [...c.because].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name);
      return [{
        f,
        collection: d.belongs_to_collection?.name ?? null,
        family: genres.includes("animation") || genres.includes("family"),
        score: c.score * ageFactor(released) * qualityFactor(d.vote_average ?? null) * fameFactor(d.vote_count ?? 0),
        reason: because.length ? `Because you liked ${because.join(" and ")}` : null,
        first: because[0] ?? null,
      }];
    }).sort((a, b) => b.score - a.score);

    // Which of the front-runners are superhero work, from their keywords.
    const caped = new Set<string>();
    await mapPool(scored.slice(0, KEYWORD_CHECKS), 6, async (x) => {
      try {
        const k = await tmdb<{ keywords?: { name: string }[]; results?: { name: string }[] }>(`/${x.f.kind}/${x.f.tmdbId}/keywords`);
        if ((k.keywords ?? k.results ?? []).some((w) => CAPED.has(w.name.toLowerCase()))) caped.add(key(x.f.tmdbId, x.f.kind));
      } catch {
        // Unknown counts as not caped: the cap is a balance, not a filter.
      }
    });

    const perCollection = new Map<string, number>();
    const perReason = new Map<string, number>();
    let families = 0;
    let capes = 0;
    const chosen: typeof scored = [];
    for (const x of scored) {
      if (chosen.length >= PICKS) break;
      const c = x.collection;
      if (c && (perCollection.get(c) ?? 0) >= PER_COLLECTION) continue;
      if (x.first && (perReason.get(x.first) ?? 0) >= PER_REASON) continue;
      if (x.family && families >= FAMILY_MAX) continue;
      const isCaped = caped.has(key(x.f.tmdbId, x.f.kind));
      if (isCaped && capes >= CAPED_MAX) continue;
      if (isCaped) capes++;
      if (x.family) families++;
      if (c) perCollection.set(c, (perCollection.get(c) ?? 0) + 1);
      if (x.first) perReason.set(x.first, (perReason.get(x.first) ?? 0) + 1);
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
