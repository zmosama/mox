/**
 * Keep the TV calendar stocked from TMDB.
 *
 * `episodes` came from the legacy import and reached exactly as far as the file
 * did. The site looked healthy — the calendar still had five weeks of airings
 * in it — right up until the day it would have emptied and stayed empty. A
 * calendar that runs out is worse than one that is obviously broken, because
 * nothing about it looks wrong until it is.
 *
 * Which shows: every series on a service somebody subscribes to, plus every
 * series anybody follows. Deriving the list from the calendar's own rows looked
 * cheaper and was wrong — a show between seasons has nothing upcoming, so its
 * stale future rows come out, so it vanishes from the list, so it is never
 * asked about again. Strictly Come Dancing and three others fell off exactly
 * that way on the first run and would never have come back. Asking about the
 * whole `titles` table instead was right but wasteful: two in five of those
 * series stream nowhere anybody here can reach.
 *
 * The cost is one request per such series per night, most of them answered from
 * the disk cache and most needing no follow-up because the show has ended. That
 * is the right thing to spend to make "it fixes itself" true.
 */
import { and, eq, gte, inArray, isNotNull, notInArray } from "drizzle-orm";
import { airsInLocalPrime, arrivalOf, landsOn } from "../../src/lib/airing";
import { addDaysISO } from "../../src/lib/dates";
import {
  catalogue, db, HOME, mapPool, s, saveTitle, fetchTitle, subscribed, type Fetched,
} from "./shared.mjs";
import { includedOn, type WatchProviders } from "../../src/lib/providers";
import { fetchSchedule } from "./tvmaze.mjs";
import {
  EMPTY_SCHEDULE, episodeKey, type Schedule, type ShowSchedule,
} from "../../src/lib/tvmaze";
import { tmdb } from "../../src/lib/tmdb";

/** How far ahead to stock it. The page itself shows a fortnight. */
const HORIZON_DAYS = 60;

type Episode = { season_number: number; episode_number: number; air_date: string | null };

type Airing = { season: number; episode: number; airs: string };

/**
 * One season's episodes, dated by when they reach us rather than by when the
 * network showed them.
 *
 * The scan starts a day before `from` because that is exactly the episode the
 * shift is for: an HBO Sunday is our Monday, so yesterday's printed date can
 * still be today's arrival. Anything that lands before `from` once shifted is
 * dropped here, so the widened scan never widens the result.
 */
async function upcomingEpisodes(
  tmdbId: number,
  seasonNumber: number,
  from: string,
  to: string,
  shifted: boolean,
  known: ShowSchedule | null,
  catalogueServices: ReturnType<typeof catalogue>,
) {
  /* The season's own watch providers come in the same request: which service
     has *these* episodes, which is not always the show's. */
  const season = await tmdb<{ episodes?: Episode[]; "watch/providers"?: { results?: WatchProviders } }>(
    `/tv/${tmdbId}/season/${seasonNumber}`,
    { append_to_response: "watch/providers" },
  );
  const regions = season["watch/providers"]?.results ?? {};
  // No region at all means TMDB has no answer for this season, which is not the
  // same as "on nothing": that season is left to the show's own listing.
  const services = Object.keys(regions).length ? includedOn(regions, catalogueServices, HOME) : null;
  const scanFrom = addDaysISO(from, -1);
  const out: Airing[] = [];
  let timed = 0;

  for (const e of season.episodes ?? []) {
    if (!e.air_date || e.air_date < scanFrom || e.air_date > to) continue;

    /* TMDB stays the list of which episodes exist — it is the source the rest
       of the app is built on — and TVmaze is consulted only for when each one
       arrives. Keeping the correction this narrow means a show TVmaze has never
       heard of behaves exactly as it did before. */
    const { airs, timed: fromStamp } = arrivalOf(
      e.air_date,
      known?.get(episodeKey(e.season_number, e.episode_number)),
      shifted,
    );
    if (fromStamp) timed++;

    if (airs < from || airs > to) continue;
    out.push({ season: e.season_number, episode: e.episode_number, airs });
  }
  return { out, timed, season: seasonNumber, services };
}

type Refreshed = {
  tmdbId: number; show: string; airings: Airing[]; title: Fetched; timed: number;
  seasons: { season: number; services: string[] | null }[];
};

export async function refreshCalendar(today: string, extraSeries: number[] = []) {
  const services = catalogue();
  const horizon = addDaysISO(today, HORIZON_DAYS);

  /* An unreachable TVmaze must not cost us the calendar. Every show simply
     falls back to the network list, which is what the whole calendar ran on
     until today — a worse answer than the timestamps, and a far better one than
     no calendar at all. */
  let schedule: Schedule = EMPTY_SCHEDULE;
  try {
    schedule = await fetchSchedule();
  } catch (e) {
    console.warn(`  TVmaze unavailable, falling back to air dates: ${(e as Error).message}`);
  }

  /* The calendar's `show` column is its primary key and holds whatever name was
     in use when the row was written — "American Dad", where TMDB says "American
     Dad!". Reusing the existing name keeps one show as one row instead of
     quietly splitting it in two. */
  const named = new Map<number, string>();
  for (const row of db
    .selectDistinct({ tmdbId: s.episodes.tmdbId, show: s.episodes.show })
    .from(s.episodes)
    .where(isNotNull(s.episodes.tmdbId))
    .all()) {
    if (row.tmdbId !== null && !named.has(row.tmdbId)) named.set(row.tmdbId, row.show);
  }

  /**
   * Which shows are worth a request tonight.
   *
   * Every series the site had ever heard of used to be asked about — 585 of
   * them, of which 344 are on a service anybody subscribes to. The other 240
   * were a request each, nightly, for a calendar row nobody could act on.
   *
   * Anything followed is asked about regardless of where it streams. A show you
   * starred is a show you want the date for even if you will be finding it
   * somewhere this app does not know about, and the follow is the clearest
   * statement of intent in the database.
   */
  const mine = subscribed().map((x) => x.providerId);
  const series = db
    .selectDistinct({ tmdbId: s.titles.tmdbId })
    .from(s.titles)
    .innerJoin(
      s.availability,
      and(
        eq(s.availability.tmdbId, s.titles.tmdbId),
        eq(s.availability.kind, s.titles.kind),
      ),
    )
    .innerJoin(s.services, eq(s.services.name, s.availability.provider))
    .where(and(eq(s.titles.kind, "tv"), inArray(s.services.providerId, mine)))
    .all();

  const followed = db.selectDistinct({ tmdbId: s.follows.tmdbId }).from(s.follows).all();
  const wanted = [
    ...new Set([
      ...series.map((t) => t.tmdbId),
      ...followed.map((f) => f.tmdbId),
      ...extraSeries,
    ]),
  ];

  if (!wanted.length) return "no shows to track";

  const refreshed = await mapPool(wanted, 6, async (tmdbId): Promise<Refreshed | null> => {
    const title = await fetchTitle(tmdbId, "tv", services);
    if (!title) return null;

    const shifted = airsInLocalPrime(title.detail.networks);
    const next = title.detail.next_episode_to_air;
    const last = title.detail.last_episode_to_air;

    /* No next episode means the show has ended or is between seasons. That is
       still an answer: its future rows are stale and come out. Skipping the
       season request here is most of what keeps this job short — most of a
       long-lived calendar is shows that finished years ago.

       The finale is the exception. TMDB clears `next_episode_to_air` the moment
       a season ends, so a Sunday-night finale that only reaches us on the
       Monday would have no season left to find it in on the very morning it
       arrives. Its season is scanned too when its printed date is recent enough
       to still be landing. */
    const seasons = [
      ...new Set(
        [
          next?.season_number,
          last?.air_date && landsOn(last.air_date, shifted) >= today
            ? last.season_number
            : undefined,
        ].filter((n): n is number => n !== undefined),
      ),
    ];

    const known = schedule.forShow(
      title.detail.external_ids?.imdb_id ?? null,
      title.detail.external_ids?.tvdb_id ?? null,
    );

    const scanned = await Promise.all(
      seasons.map((n) =>
        upcomingEpisodes(tmdbId, n, today, horizon, shifted, known, services).catch(() => null),
      ),
    );
    if (scanned.some((season) => season === null)) return null;
    const found = scanned as { out: Airing[]; timed: number; season: number; services: string[] | null }[];

    return {
      tmdbId,
      show: named.get(tmdbId) ?? title.detail.name ?? title.detail.title ?? `#${tmdbId}`,
      airings: found.flatMap((f) => f.out),
      timed: found.reduce((n, f) => n + f.timed, 0),
      seasons: found.map((f) => ({ season: f.season, services: f.services })),
      title,
    };
  });

  const ok = refreshed.filter((r): r is Refreshed => r !== null);

  /**
   * Rows for shows this run no longer asks about.
   *
   * Narrowing the walk left 747 future airings behind on the first run: shows
   * dropped from the list keep whatever rows they had, are never revisited, and
   * so sit on the calendar at a date that stops being true and never comes off
   * even after it passes. A calendar that quietly stops updating part of itself
   * is the failure this file was written to prevent, so scope changes take
   * their rows with them.
   *
   * Only when the run actually produced something. With TMDB unreachable every
   * fetch returns null, `ok` is empty, and this would read as "nothing is in
   * scope any more" and empty the calendar on a bad night.
   */
  const dropped = ok.length
    ? db
        .delete(s.episodes)
        .where(
          and(
            gte(s.episodes.airs, today),
            isNotNull(s.episodes.tmdbId),
            notInArray(s.episodes.tmdbId, wanted),
          ),
        )
        .run().changes
    : 0;

  db.transaction((tx) => {
    for (const show of ok) {
      /* Only the future is rebuilt. What already aired is a record of what this
         calendar said at the time, and TMDB is not a better source for it than
         the calendar itself. */
      tx.delete(s.episodes)
        .where(and(eq(s.episodes.show, show.show), gte(s.episodes.airs, today)))
        .run();

      for (const a of show.airings) {
        tx.insert(s.episodes)
          .values({
            show: show.show,
            season: a.season,
            episode: a.episode,
            airs: a.airs,
            tmdbId: show.tmdbId,
          })
          .onConflictDoUpdate({
            target: [s.episodes.show, s.episodes.season, s.episodes.episode],
            set: { airs: a.airs, tmdbId: show.tmdbId },
          })
          .run();
      }

      // Posters and service badges on the calendar come from `titles` and
      // `availability`, so a show new to the calendar has to bring them along.
      saveTitle(tx, show.title);

      for (const { season, services: names } of show.seasons) {
        const key = and(eq(s.seasonServices.tmdbId, show.tmdbId), eq(s.seasonServices.season, season));
        /* Only a season that names a service overrides the show. TMDB's
           per-season listings lag: Survivor's new season was listed on
           nothing here while it was plainly on OSN+, so an empty answer is
           taken as "not known yet", never as "on nothing". */
        if (!names?.length) {
          tx.delete(s.seasonServices).where(key).run();
          continue;
        }
        tx.insert(s.seasonServices)
          .values({ tmdbId: show.tmdbId, season, services: JSON.stringify(names) })
          .onConflictDoUpdate({
            target: [s.seasonServices.tmdbId, s.seasonServices.season],
            set: { services: JSON.stringify(names), updatedAt: Math.floor(Date.now() / 1000) },
          })
          .run();
      }
    }
  });

  const airing = ok.filter((r) => r.airings.length).length;
  const episodes = ok.reduce((n, r) => n + r.airings.length, 0);
  const missed = refreshed.length - ok.length;
  /* Worth a line of its own: if TVmaze changes shape or starts refusing us, the
     calendar keeps working off the network list and the only visible symptom
     would be dates quietly drifting back by a day. This number falling to zero
     says so out loud. */
  const timed = ok.reduce((n, r) => n + r.timed, 0);
  return `${episodes} episodes across ${airing} of ${ok.length} shows`
    + `, ${timed} timed by TVmaze`
    + (dropped ? `, ${dropped} out of scope removed` : "")
    + (missed ? `, ${missed} unreachable` : "");
}
