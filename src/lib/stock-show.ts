/**
 * Put one show on the calendar now, instead of waiting for tonight.
 *
 * The nightly job (scripts/refresh/calendar.mts) stocks the calendar with every
 * show on a service somebody pays for, plus every show anybody follows. A show
 * on neither list was only picked up the night after it was followed, so
 * following FBI or S.W.A.T. Exiles — on no service listed here — left Airing
 * saying "Nothing" for a day. This runs the same dating for that one show the
 * moment it is followed.
 *
 * It only ever adds a show the calendar does not have yet: a show already there
 * is the nightly job's, and rewriting it here would just race that job.
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { airsInLocalPrime, MAX_PLATFORM_GAP, seasonArrivals } from "./airing";
import { addDaysISO, todayISO } from "./dates";
import { tmdb } from "./tmdb";
import { episodeKey, fetchShowEpisodes } from "./tvmaze";

/** Same reach as the nightly job. */
const HORIZON_DAYS = 60;

type Detail = {
  name?: string;
  networks?: { name?: string | null; origin_country?: string | null }[];
  origin_country?: string[];
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null };
  next_episode_to_air?: { season_number: number } | null;
  last_episode_to_air?: { season_number: number; air_date?: string | null } | null;
};

type Episode = { season_number: number; episode_number: number; air_date: string | null };

/** How many episodes it added; 0 when the show was already there or has nothing coming. */
export async function stockShow(tmdbId: number, today = todayISO()): Promise<number> {
  const already = db
    .select({ show: schema.episodes.show })
    .from(schema.episodes)
    .where(and(eq(schema.episodes.tmdbId, tmdbId), gte(schema.episodes.airs, today)))
    .get();
  if (already) return 0;

  const d = await tmdb<Detail>(`/tv/${tmdbId}`, { append_to_response: "external_ids" });
  const seasons = [
    ...new Set(
      [
        d.next_episode_to_air?.season_number,
        d.last_episode_to_air?.air_date && addDaysISO(d.last_episode_to_air.air_date, MAX_PLATFORM_GAP) >= today
          ? d.last_episode_to_air.season_number
          : undefined,
      ].filter((n): n is number => n !== undefined),
    ),
  ];
  if (!seasons.length) return 0;

  const shifted = airsInLocalPrime(d.networks, d.origin_country);
  const american = (d.origin_country ?? []).includes("US");
  // The show's own list from TVmaze, aired episodes included, so a two-day
  // pattern can be read even when one episode is left (see needsHistory).
  const known = await fetchShowEpisodes(d.external_ids?.imdb_id ?? null, d.external_ids?.tvdb_id ?? null).catch(() => null);

  // Keep the name the calendar already uses for this show, if it ever had one.
  const named = db
    .select({ show: schema.episodes.show })
    .from(schema.episodes)
    .where(and(eq(schema.episodes.tmdbId, tmdbId), isNotNull(schema.episodes.show)))
    .get()?.show;
  const show = named ?? d.name ?? `#${tmdbId}`;
  const horizon = addDaysISO(today, HORIZON_DAYS);

  const rows: (typeof schema.episodes.$inferInsert)[] = [];
  for (const n of seasons) {
    const season = await tmdb<{ episodes?: Episode[] }>(`/tv/${tmdbId}/season/${n}`);
    const printed = (season.episodes ?? [])
      .filter((e): e is Episode & { air_date: string } => Boolean(e.air_date))
      .map((e) => ({ ...e, key: episodeKey(e.season_number, e.episode_number), airDate: e.air_date }));
    const arrivals = seasonArrivals(printed, known, shifted, american);
    for (const e of printed) {
      const a = arrivals.get(e.key)!;
      if (a.airs < today || a.airs > horizon) continue;
      const at = a.stamp ? Date.parse(a.stamp) : NaN;
      rows.push({
        show,
        season: e.season_number,
        episode: e.episode_number,
        airs: a.airs,
        airsAt: Number.isNaN(at) ? null : Math.floor(at / 1000),
        tmdbId,
      });
    }
  }

  db.transaction((tx) => {
    for (const r of rows) {
      tx.insert(schema.episodes)
        .values(r)
        .onConflictDoUpdate({
          target: [schema.episodes.show, schema.episodes.season, schema.episodes.episode],
          set: { airs: r.airs, airsAt: r.airsAt, tmdbId },
        })
        .run();
    }
  });
  return rows.length;
}
