/**
 * What every refresh step needs: the database, the service catalogue, and the
 * one way a title is written.
 *
 * The steps run in one process against one SQLite file. Each opens its own
 * transaction and none of them reach into another's tables, so a step that
 * fails leaves the rest of the site exactly as it was.
 */
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as s from "../../src/db/schema";
import type { MediaKind } from "../../src/db/schema";
import { includedOn, type WatchProviders } from "../../src/lib/providers";
import { posterPath, region, tmdb } from "../../src/lib/tmdb";

export const HOME = region();

const sqlite = new Database(process.env.MOX_DB ?? "./data/mox.db");
sqlite.pragma("journal_mode = WAL");
// The site is serving from this same file. Without a timeout a write landing
// mid-request throws SQLITE_BUSY and the whole nightly run dies.
sqlite.pragma("busy_timeout = 10000");

export const db = drizzle(sqlite, { schema: s });
export { s };
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The install's services, in TMDB's own priority order. */
export function catalogue() {
  return db
    .select({
      providerId: s.services.providerId,
      name: s.services.name,
      regions: s.services.regions,
    })
    .from(s.services)
    .orderBy(s.services.priority)
    .all();
}

/**
 * The services somebody here actually pays for.
 *
 * `catalogue()` is what this install can recognise — forty-five providers, most
 * of which nobody has ever subscribed to. Sweeping all of them meant asking
 * TMDB about titles no page would ever render: twenty-six of the two hundred
 * slots in /new were held by films on services nobody has, and they were
 * dropped again at read time, so the cost was paid twice and the shelf space
 * was lost for nothing.
 *
 * The union across accounts, not one viewer's picks — the refresh is shared, so
 * narrowing it to whoever ran last would empty the site for everybody else.
 *
 * Nobody having chosen yet means "not told", not "subscribes to nothing", which
 * is the same reading `availabilityFor` takes: a fresh install sweeps the whole
 * catalogue rather than nothing at all.
 */
export function subscribed() {
  const all = catalogue();
  const picked = new Set(
    db.selectDistinct({ providerId: s.userServices.providerId })
      .from(s.userServices)
      .all()
      .map((r) => r.providerId),
  );
  if (!picked.size) return all;
  return all.filter((x) => picked.has(x.providerId));
}

/** Bounded concurrency: polite to TMDB, and 250 titles in seconds not minutes. */
export async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (let i = cursor++; i < items.length; i = cursor++) out[i] = await fn(items[i]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

// --------------------------------------------------------------------- titles

/** The fields of a TMDB film or series this app stores. */
export type Detail = {
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  original_language?: string;
  runtime?: number;
  episode_run_time?: number[];
  belongs_to_collection?: { name: string } | null;
  next_episode_to_air?: { season_number: number } | null;
  /* The finale case: once a season ends TMDB clears `next_episode_to_air`, so
     this is the only handle left on the episode that just aired — and with the
     landing-date shift, "just aired" can still be reaching us this morning. */
  last_episode_to_air?: { season_number: number; air_date?: string | null } | null;
  /** Who broadcasts it, which decides whether its air date needs shifting. */
  networks?: { name?: string | null }[];
  /** How a series is found in TVmaze, which knows what time it airs. */
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null };
  "watch/providers"?: { results?: WatchProviders };
};

export type Fetched = {
  tmdbId: number;
  kind: MediaKind;
  detail: Detail;
  platforms: string[];
};

/** One title with its providers resolved. Returns null rather than throwing: a
    single title TMDB cannot answer for must not end a whole nightly run. */
export async function fetchTitle(
  tmdbId: number,
  kind: MediaKind,
  services: ReturnType<typeof catalogue>,
): Promise<Fetched | null> {
  try {
    /* Only series ask for `external_ids`: it is what matches a show to TVmaze,
       films have no use for it, and the disk cache is keyed on the query, so
       appending it for both would have thrown away every film ever cached. */
    const detail = await tmdb<Detail>(`/${kind}/${tmdbId}`, {
      append_to_response: kind === "tv" ? "watch/providers,external_ids" : "watch/providers",
    });
    return {
      tmdbId,
      kind,
      detail,
      platforms: includedOn(detail["watch/providers"]?.results, services, HOME),
    };
  } catch (e) {
    console.warn(`  skipped ${kind}/${tmdbId}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Write a title and what it streams on.
 *
 * Deliberately writes no rows to `features`. Genres would be free to collect
 * here, but `features` is the taste model's input — changing it changes what the
 * board recommends, and the golden differential in taste.test.ts exists to catch
 * exactly that. Enriching it is its own decision, not a side effect of keeping
 * the site current.
 */
export function saveTitle(tx: Tx, { tmdbId, kind, detail, platforms }: Fetched) {
  const releaseDate = detail.release_date || detail.first_air_date || null;

  /* Everything TMDB is the better source for, and which moves: scores, vote
     counts, posters, the release date once it firms up. */
  const current = {
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    releaseDate,
    poster: posterPath(detail.poster_path),
    backdrop: posterPath(detail.backdrop_path, "w780"),
    overview: detail.overview || null,
    rating: detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null,
    votes: detail.vote_count ?? null,
    lang: detail.original_language ?? null,
    runtime: detail.runtime ?? detail.episode_run_time?.[0] ?? null,
    collection: detail.belongs_to_collection?.name ?? null,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  /**
   * A title already here keeps the name it has. TMDB answers in en-US, so the
   * first run of this renamed "البرنس" to "The Prince" and "The Office (US)" to
   * "The Office" — a library curated over years, relabelled overnight by a job
   * that was only supposed to keep scores fresh. Naming is a decision somebody
   * made; refreshing is not the place to overturn it. New titles take TMDB's
   * name because there is nothing else to go on.
   */
  tx.insert(s.titles)
    .values({ tmdbId, kind, title: detail.title ?? detail.name ?? "Untitled", ...current })
    .onConflictDoUpdate({ target: [s.titles.tmdbId, s.titles.kind], set: current })
    .run();

  /* Deep links are hand-curated — they came from the legacy import and TMDB has
     never known about them — so a provider that is still carrying the title
     keeps the link it already had instead of being rebuilt as a bare name. */
  const where = and(eq(s.availability.tmdbId, tmdbId), eq(s.availability.kind, kind));
  const links = new Map(
    tx.select().from(s.availability).where(where).all().map((a) => [a.provider, a.deepLink]),
  );
  tx.delete(s.availability).where(where).run();
  for (const provider of platforms) {
    tx.insert(s.availability)
      .values({
        tmdbId,
        kind,
        provider,
        region: HOME,
        deepLink: links.get(provider) ?? null,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .onConflictDoNothing()
      .run();
  }
}
