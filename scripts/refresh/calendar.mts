/**
 * Keep the TV calendar stocked from TMDB.
 *
 * `episodes` came from the legacy import and reached exactly as far as the file
 * did. The site looked healthy — the calendar still had five weeks of airings
 * in it — right up until the day it would have emptied and stayed empty. A
 * calendar that runs out is worse than one that is obviously broken, because
 * nothing about it looks wrong until it is.
 *
 * Which shows: every series the site knows about. Deriving the list from the
 * calendar's own rows looked cheaper and was wrong — a show between seasons has
 * nothing upcoming, so its stale future rows come out, so it vanishes from the
 * list, so it is never asked about again. Strictly Come Dancing and three others
 * fell off exactly that way on the first run and would never have come back.
 *
 * The cost is one request per known series per night, most of them answered
 * from the disk cache and most needing no follow-up because the show has ended.
 * That is the right thing to spend to make "it fixes itself" true.
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { addDaysISO } from "../../src/lib/dates";
import { catalogue, db, mapPool, s, saveTitle, fetchTitle, type Fetched } from "./shared.mjs";
import { tmdb } from "../../src/lib/tmdb";

/** How far ahead to stock it. The page itself shows a fortnight. */
const HORIZON_DAYS = 60;

type Episode = { season_number: number; episode_number: number; air_date: string | null };

type Airing = { season: number; episode: number; airs: string };

async function upcomingEpisodes(tmdbId: number, seasonNumber: number, from: string, to: string) {
  const season = await tmdb<{ episodes?: Episode[] }>(`/tv/${tmdbId}/season/${seasonNumber}`, {});
  const out: Airing[] = [];
  for (const e of season.episodes ?? []) {
    if (!e.air_date || e.air_date < from || e.air_date > to) continue;
    out.push({ season: e.season_number, episode: e.episode_number, airs: e.air_date });
  }
  return out;
}

type Refreshed = { tmdbId: number; show: string; airings: Airing[]; title: Fetched };

export async function refreshCalendar(today: string, extraSeries: number[] = []) {
  const services = catalogue();
  const horizon = addDaysISO(today, HORIZON_DAYS);

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

  const series = db
    .selectDistinct({ tmdbId: s.titles.tmdbId })
    .from(s.titles)
    .where(eq(s.titles.kind, "tv"))
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

    const next = title.detail.next_episode_to_air;
    /* No next episode means the show has ended or is between seasons. That is
       still an answer: its future rows are stale and come out. Skipping the
       season request here is most of what keeps this job short — most of a
       long-lived calendar is shows that finished years ago. */
    const airings = next
      ? await upcomingEpisodes(tmdbId, next.season_number, today, horizon).catch(() => null)
      : [];
    if (airings === null) return null;

    return {
      tmdbId,
      show: named.get(tmdbId) ?? title.detail.name ?? title.detail.title ?? `#${tmdbId}`,
      airings,
      title,
    };
  });

  const ok = refreshed.filter((r): r is Refreshed => r !== null);

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
    }
  });

  const airing = ok.filter((r) => r.airings.length).length;
  const episodes = ok.reduce((n, r) => n + r.airings.length, 0);
  const missed = refreshed.length - ok.length;
  return `${episodes} episodes across ${airing} of ${ok.length} shows${missed ? `, ${missed} unreachable` : ""}`;
}
