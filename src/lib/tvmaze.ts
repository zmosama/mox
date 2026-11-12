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

/**
 * What TVmaze says about one episode.
 *
 * Two kinds, kept apart because they mean different things:
 *
 * - **timed** — a broadcast with a real air time. `airs` is already the date in
 *   Cairo, read off `stamp`, the exact instant.
 * - **date-only** — a streaming release. TVmaze prints the service's official
 *   day and no time, and `web` names the service. `airs` is that official day,
 *   *not yet* moved to ours: airing.ts decides when it counts as out here.
 *
 * `stamp` is null for date-only entries on purpose. TVmaze fills in a noon UTC
 * placeholder for them, and treating it as an instant would send a "new
 * episode" notification at a time nobody released anything.
 */
export type Arrival = { airs: string; stamp: string | null; web: string | null };

/** One show's episodes, keyed by {@link episodeKey}. */
export type ShowSchedule = Map<string, Arrival>;

type Channel = { name?: string | null } | null;

export type ScheduleEntry = {
  season?: number | null;
  number?: number | null;
  airdate?: string | null;
  airtime?: string | null;
  airstamp?: string | null;
  _embedded?: {
    show?: {
      externals?: { imdb?: string | null; thetvdb?: number | null } | null;
      network?: Channel;
      webChannel?: Channel;
    };
  };
};

export type Schedule = {
  /** Null when TVmaze has no entry for the show — the caller falls back. */
  forShow: (imdbId: string | null, tvdbId: number | null) => ShowSchedule | null;
  /** How many episodes carried a usable air time, for the run's summary. */
  dated: number;
  /** How many streaming releases carried their service's official day. */
  streamed: number;
};

export const episodeKey = (season: number, episode: number) => `${season}x${episode}`;

export const EMPTY_SCHEDULE: Schedule = { forShow: () => null, dated: 0, streamed: 0 };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function indexSchedule(entries: ScheduleEntry[]): Schedule {
  const byShow = new Map<string, ShowSchedule>();
  let dated = 0;
  let streamed = 0;

  for (const e of entries) {
    if (e.season == null || e.number == null) continue;
    const show = e._embedded?.show;

    let arrival: Arrival | null = null;
    if (e.airtime && e.airstamp) {
      const airs = landsOnStamp(e.airstamp);
      if (airs) arrival = { airs, stamp: e.airstamp, web: null };
    } else if (!show?.network && show?.webChannel?.name && e.airdate && ISO_DAY.test(e.airdate)) {
      /* A streamer's episode with no time is still a firm date: the service
         announces "Fridays" and TVmaze prints the Friday. Before, these were
         dropped with the broadcasts and TMDB's date stood instead — which is
         the evening-before American date for Apple TV (Nocturne on Thursday,
         live here Friday at 4am) and Showtime's Sunday for a show Paramount+
         streams on the Friday (Dexter: Resurrection, two days late). */
      arrival = { airs: e.airdate, stamp: null, web: show.webChannel.name };
    }
    /* A *broadcast* with a blank time is TVmaze saying it does not know, not
       saying midnight: its stamp is a placeholder, and believing it would put
       every evening broadcast back on the wrong day. Those are left to the
       network list. */
    if (!arrival) continue;

    const externals = show?.externals;
    const keys: string[] = [];
    if (externals?.imdb) keys.push(`imdb:${externals.imdb}`);
    if (externals?.thetvdb) keys.push(`tvdb:${externals.thetvdb}`);
    if (!keys.length) continue;

    for (const key of keys) {
      const episodes = byShow.get(key) ?? new Map<string, Arrival>();
      episodes.set(episodeKey(e.season, e.number), arrival);
      byShow.set(key, episodes);
    }
    if (arrival.stamp) dated++;
    else streamed++;
  }

  return {
    dated,
    streamed,
    forShow: (imdbId, tvdbId) =>
      (imdbId ? byShow.get(`imdb:${imdbId}`) : undefined) ??
      (tvdbId ? byShow.get(`tvdb:${tvdbId}`) : undefined) ??
      null,
  };
}

/** TVmaze asks that clients identify themselves. */
const UA = "mox/1.0 (personal streaming calendar)";

type Show = {
  id: number;
  externals?: { imdb?: string | null; thetvdb?: number | null } | null;
  network?: { name?: string | null } | null;
  webChannel?: { name?: string | null } | null;
};

/**
 * One show's whole episode list, aired episodes included, in the same shape as
 * the schedule. Asked for only when a season's gap needs its history to be
 * believed (airing.ts `needsHistory`), which is a handful of shows a night.
 */
export async function fetchShowEpisodes(imdbId: string | null, tvdbId: number | null): Promise<ShowSchedule | null> {
  const get = async <T,>(url: string): Promise<T | null> => {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TVmaze ${res.status}`);
    return (await res.json()) as T;
  };
  const show =
    (imdbId ? await get<Show>(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(imdbId)}`) : null) ??
    (tvdbId ? await get<Show>(`https://api.tvmaze.com/lookup/shows?thetvdb=${tvdbId}`) : null);
  if (!show) return null;
  const episodes = (await get<ScheduleEntry[]>(`https://api.tvmaze.com/shows/${show.id}/episodes`)) ?? [];
  const embedded = { show: { externals: show.externals, network: show.network, webChannel: show.webChannel } };
  return indexSchedule(episodes.map((e) => ({ ...e, _embedded: embedded })))
    .forShow(show.externals?.imdb ?? null, show.externals?.thetvdb ?? null);
}
