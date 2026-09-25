/**
 * Turning TVmaze's schedule into arrival dates.
 *
 * Kept out of the fetching script for the same reason `feeds.ts` is: which
 * episodes are usable and what date each one lands on is a decision worth
 * testing, and it should not need the network to answer.
 *
 * Matching is by IMDb or TVDB id and never by name. "The Office" is four shows,
 * and a calendar that guesses between them is worse than one that admits it
 * cannot tell and leaves the episode to the network list instead.
 */
import { landsOnStamp } from "./airing";

/** Arrival dates for one show, keyed by {@link episodeKey}. */
export type ShowSchedule = Map<string, string>;

export type ScheduleEntry = {
  season?: number | null;
  number?: number | null;
  airtime?: string | null;
  airstamp?: string | null;
  _embedded?: { show?: { externals?: { imdb?: string | null; thetvdb?: number | null } | null } };
};

export type Schedule = {
  /** Null when TVmaze has no entry for the show — the caller falls back. */
  forShow: (imdbId: string | null, tvdbId: number | null) => ShowSchedule | null;
  /** How many episodes carried a usable air time, for the run's summary. */
  dated: number;
  /**
   * The same episodes' exact instants (ISO), for notifying when an episode
   * actually lands rather than at one fixed hour for the whole day.
   */
  stampsFor: (imdbId: string | null, tvdbId: number | null) => Map<string, string> | null;
};

export const episodeKey = (season: number, episode: number) => `${season}x${episode}`;

export const EMPTY_SCHEDULE: Schedule = { forShow: () => null, stampsFor: () => null, dated: 0 };

export function indexSchedule(entries: ScheduleEntry[]): Schedule {
  const byShow = new Map<string, ShowSchedule>();
  const stamps = new Map<string, Map<string, string>>();
  let dated = 0;

  for (const e of entries) {
    /* A blank air time is TVmaze saying it does not know, not saying midnight.
       It still emits a stamp for those — a 04:00 UTC placeholder — and taking
       it at face value would quietly assert that nothing ever airs in the
       evening, re-creating the exact bug this file exists to fix. Those
       episodes are dropped so the caller keeps the network list's answer. */
    if (!e.airtime || !e.airstamp || e.season == null || e.number == null) continue;

    const airs = landsOnStamp(e.airstamp);
    if (!airs) continue;

    const externals = e._embedded?.show?.externals;
    const keys: string[] = [];
    if (externals?.imdb) keys.push(`imdb:${externals.imdb}`);
    if (externals?.thetvdb) keys.push(`tvdb:${externals.thetvdb}`);
    if (!keys.length) continue;

    for (const key of keys) {
      const show = byShow.get(key) ?? new Map<string, string>();
      show.set(episodeKey(e.season, e.number), airs);
      byShow.set(key, show);
      const at = stamps.get(key) ?? new Map<string, string>();
      at.set(episodeKey(e.season, e.number), e.airstamp);
      stamps.set(key, at);
    }
    dated++;
  }

  return {
    dated,
    stampsFor: (imdbId, tvdbId) =>
      (imdbId ? stamps.get(`imdb:${imdbId}`) : undefined) ??
      (tvdbId ? stamps.get(`tvdb:${tvdbId}`) : undefined) ??
      null,
    forShow: (imdbId, tvdbId) =>
      (imdbId ? byShow.get(`imdb:${imdbId}`) : undefined) ??
      (tvdbId ? byShow.get(`tvdb:${tvdbId}`) : undefined) ??
      null,
  };
}
