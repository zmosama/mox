/**
 * Where you are in a series: how many episodes there are, how many have
 * reached you, how many you have watched, and the current season episode by
 * episode — so a show's page answers "how far am I, and what's left".
 *
 * "Reached you" uses the calendar's own arrival dates where it has them — an
 * HBO episode dated Sunday by TMDB lands here on the Monday — and TMDB's air
 * date for the rest.
 */
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { region, tmdb } from "./tmdb";
import { includedOn, type ServiceEntry, type WatchProviders } from "./providers";

export type TmdbSeasonSummary = { season_number: number; episode_count: number; name?: string; air_date?: string | null };
type TmdbEpisodeRef = { season_number: number; episode_number: number; air_date?: string | null };

export type SeriesShape = {
  seasons?: TmdbSeasonSummary[];
  last_episode_to_air?: TmdbEpisodeRef | null;
  next_episode_to_air?: TmdbEpisodeRef | null;
};

export type EpisodeRow = {
  season: number;
  episode: number;
  name: string | null;
  /** The Cairo date it reaches a viewer here, or null when nobody has dated it. */
  airs: string | null;
  out: boolean;
  watched: boolean;
};

export type Progress = {
  season: number;
  seasonName: string;
  seasonCount: number;
  /** Every season, for the picker: its number, name and size. */
  seasons: { season: number; name: string; episodes: number }[];
  totalEpisodes: number;
  aired: number;
  watched: number;
  episodes: EpisodeRow[];
  next: { season: number; episode: number; airs: string | null } | null;
  /**
   * Where this season streams, when TMDB names a service for it: MobLand's
   * second season is on TOD though the show is listed on Netflix. Null when
   * the season has no listing of its own and the show's stands.
   */
  services: string[] | null;
};

/**
 * The season to show: the one airing now if an episode is due, otherwise the
 * last one that aired, otherwise the first.
 */
export function currentSeason(show: SeriesShape): number {
  return (
    show.next_episode_to_air?.season_number ??
    show.last_episode_to_air?.season_number ??
    show.seasons?.find((s) => s.season_number > 0)?.season_number ??
    1
  );
}

/**
 * Put the pieces together. Pure, so it is tested without TMDB: `episodes` is
 * the season's list from TMDB, `arrivals` the calendar's dates for it,
 * `watchedSet` every "season:episode" ticked for the show.
 */
export function buildProgress(
  show: SeriesShape,
  season: number,
  episodes: { episode_number: number; name?: string; air_date?: string | null }[],
  arrivals: Map<number, string>,
  watchedSet: Set<string>,
  today: string,
): Progress {
  const seasons = (show.seasons ?? []).filter((s) => s.season_number > 0);
  const rows: EpisodeRow[] = episodes.map((e) => {
    const airs = arrivals.get(e.episode_number) ?? e.air_date ?? null;
    return {
      season,
      episode: e.episode_number,
      name: e.name?.trim() || null,
      airs,
      out: airs !== null && airs <= today,
      watched: watchedSet.has(`${season}:${e.episode_number}`),
    };
  });

  // Every earlier season is out in full; this one counts what has arrived;
  // later seasons, announced and not started, count for nothing yet.
  const aired =
    seasons.filter((s) => s.season_number < season).reduce((n, s) => n + s.episode_count, 0) +
    rows.filter((r) => r.out).length;

  const upcoming = rows.find((r) => !r.out);
  const thisSeason = seasons.find((s) => s.season_number === season);
  return {
    season,
    seasonName: thisSeason?.name || `Season ${season}`,
    seasonCount: seasons.length,
    seasons: seasons.map((s) => ({ season: s.season_number, name: s.name || `Season ${s.season_number}`, episodes: s.episode_count })),
    totalEpisodes: seasons.reduce((n, s) => n + s.episode_count, 0),
    aired,
    watched: [...watchedSet].filter((k) => !k.startsWith("0:")).length,
    episodes: rows,
    next: upcoming ? { season, episode: upcoming.episode, airs: upcoming.airs } : null,
    services: null,
  };
}

/**
 * A series' progress for one viewer (or for nobody: then nothing is watched),
 * shown at `season` — the one you picked — or the current one.
 */
export async function seriesProgress(
  tmdbId: number,
  show: SeriesShape,
  userId: number | null,
  today: string,
  pick?: number,
  chosen: ServiceEntry[] = [],
): Promise<Progress | null> {
  const known = (show.seasons ?? []).some((s) => s.season_number === pick && pick > 0);
  const season = pick !== undefined && known ? pick : currentSeason(show);
  let episodes: { episode_number: number; name?: string; air_date?: string | null }[] = [];
  let services: string[] | null = null;
  try {
    // The same request, and cache entry, as the nightly calendar's.
    const body = await tmdb<{ episodes?: typeof episodes; "watch/providers"?: { results?: WatchProviders } }>(
      `/tv/${tmdbId}/season/${season}`,
      { append_to_response: "watch/providers" },
    );
    episodes = body.episodes ?? [];
    const named = includedOn(body["watch/providers"]?.results, chosen, region());
    // Only a season that names a service speaks for itself; see season_services.
    services = named.length ? named : null;
  } catch {
    return null;
  }
  if (!episodes.length) return null;

  const arrivals = new Map(
    db
      .select({ episode: schema.episodes.episode, airs: schema.episodes.airs })
      .from(schema.episodes)
      .where(and(eq(schema.episodes.tmdbId, tmdbId), eq(schema.episodes.season, season)))
      .all()
      .map((r) => [r.episode, r.airs]),
  );

  const watchedSet = new Set(
    userId === null
      ? []
      : db
          .select({ season: schema.watchedEpisodes.season, episode: schema.watchedEpisodes.episode })
          .from(schema.watchedEpisodes)
          .where(and(
            eq(schema.watchedEpisodes.userId, userId),
            eq(schema.watchedEpisodes.tmdbId, tmdbId),
            gt(schema.watchedEpisodes.season, -1),
          ))
          .all()
          .map((w) => `${w.season}:${w.episode}`),
  );

  return { ...buildProgress(show, season, episodes, arrivals, watchedSet, today), services };
}
