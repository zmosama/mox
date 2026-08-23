/**
 * Rebuild the /new feeds from TMDB.
 *
 *   npm run feeds:build
 *
 * The deploy schedules this nightly (deploy/launchd/feeds.plist.template) and it
 * is safe to run by hand at any time. Until it existed the feeds were whatever
 * the one-off legacy import had left in the table, so /new froze on the day of
 * the import and every visit afterwards showed a timeline ending weeks back.
 *
 * Nothing here is destructive by halves: all the network work happens first,
 * the tables are replaced in a single transaction, and a feed that came back
 * empty is left exactly as it was rather than blanking the page.
 *
 * It deliberately writes no rows to `features`. Genres would be free to collect
 * here, but `features` is the taste model's input — changing it changes what the
 * board recommends, and the golden differential in taste.test.ts exists to catch
 * exactly that. Enriching it is its own decision, not a side effect of keeping
 * a release timeline current.
 */
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as s from "../src/db/schema";
import { FEEDS, type Feed, type MediaKind } from "../src/db/schema";
import { todayISO } from "../src/lib/dates";
import { LIMIT, selectFeed, windowFor, type Candidate } from "../src/lib/feeds";
import { includedOn, type WatchProviders } from "../src/lib/providers";
import { posterPath, region, tmdb } from "../src/lib/tmdb";

const HOME = region();
const TODAY = todayISO();
/** TMDB pages are 20 items; this is a ceiling, not a target. */
const MAX_PAGES = 5;

// ------------------------------------------------------------------ database

const sqlite = new Database(process.env.MOX_DB ?? "./data/mox.db");
sqlite.pragma("journal_mode = WAL");
// The site is serving from this same file. Without a timeout a write landing
// mid-request throws SQLITE_BUSY and the whole nightly run dies.
sqlite.pragma("busy_timeout = 10000");
const db = drizzle(sqlite, { schema: s });

const services = db
  .select({
    providerId: s.services.providerId,
    name: s.services.name,
    regions: s.services.regions,
  })
  .from(s.services)
  .orderBy(s.services.priority)
  .all();

if (!services.length) {
  console.error("no services in the catalogue — run `npm run sync:services` first");
  process.exit(1);
}

// ------------------------------------------------------------------- fetching

type Listed = {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
};

type Page = { results: Listed[]; total_pages: number };

type Detail = {
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
  "watch/providers"?: { results?: WatchProviders };
};

const dateOf = (item: Listed) => item.release_date || item.first_air_date || null;

const toCandidate = (item: Listed, kind: MediaKind): Candidate => ({
  tmdbId: item.id,
  kind,
  date: dateOf(item),
  popularity: item.popularity ?? 0,
});

/** Walk a discover listing until it runs out of pages or hits the ceiling. */
async function pages(
  path: string,
  params: Record<string, string | number>,
  kind: MediaKind,
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await tmdb<Page>(path, { ...params, page });
    out.push(...body.results.map((r) => toCandidate(r, kind)));
    if (page >= body.total_pages) break;
  }
  return out;
}

/**
 * Discover sweeps, one per watch region.
 *
 * A service not sold locally has no listing under our region at all, so it gets
 * its own sweep in the regions it does exist in — the same fallback the title
 * sheet applies, otherwise Disney Plus never appears in /new no matter how much
 * it adds.
 */
const sweeps = [
  { watchRegion: HOME, providers: services.map((x) => x.providerId) },
  ...services.flatMap((service) =>
    (service.regions ?? []).map((watchRegion) => ({
      watchRegion,
      providers: [service.providerId],
    })),
  ),
];

async function gather(feed: Feed): Promise<Candidate[]> {
  if (feed === "trending") {
    const body = await tmdb<Page>("/trending/all/week", {});
    return body.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => toCandidate(r, r.media_type as MediaKind));
  }

  const { from, to } = windowFor(feed, TODAY);
  const found: Candidate[] = [];

  for (const kind of ["movie", "tv"] as const) {
    const path = kind === "movie" ? "/discover/movie" : "/discover/tv";
    const field = kind === "movie" ? "primary_release_date" : "first_air_date";
    const window = { [`${field}.gte`]: from, [`${field}.lte`]: to };

    if (feed === "upcoming") {
      /* Nothing has landed on a service yet, so there is no provider filter to
         narrow this — and the raw window is a couple of thousand titles, almost
         all of them with no votes and no poster. Popularity is what separates
         "coming soon" from "exists in the database". */
      found.push(...(await pages(path, { ...window, sort_by: "popularity.desc" }, kind)));
      continue;
    }

    for (const sweep of sweeps) {
      found.push(
        ...(await pages(
          path,
          {
            ...window,
            sort_by: `${field}.desc`,
            watch_region: sweep.watchRegion,
            with_watch_providers: sweep.providers.join("|"),
            with_watch_monetization_types: "flatrate|free|ads",
          },
          kind,
        )),
      );
    }
  }
  return found;
}

/** Bounded concurrency: polite to TMDB, and 250 titles in seconds not minutes. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (let i = cursor++; i < items.length; i = cursor++) out[i] = await fn(items[i]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

type Hydrated = { candidate: Candidate; detail: Detail; platforms: string[] };

async function hydrate(candidate: Candidate): Promise<Hydrated | null> {
  try {
    const detail = await tmdb<Detail>(`/${candidate.kind}/${candidate.tmdbId}`, {
      append_to_response: "watch/providers",
    });
    return {
      candidate,
      detail,
      platforms: includedOn(detail["watch/providers"]?.results, services, HOME),
    };
  } catch (e) {
    console.warn(`  skipped ${candidate.kind}/${candidate.tmdbId}: ${(e as Error).message}`);
    return null;
  }
}

// -------------------------------------------------------------------- writing

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function saveTitle(tx: Tx, { candidate, detail, platforms }: Hydrated) {
  const { tmdbId, kind } = candidate;
  const title = detail.title ?? detail.name ?? "Untitled";
  const releaseDate = detail.release_date || detail.first_air_date || null;

  const row = {
    tmdbId,
    kind,
    title,
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

  tx.insert(s.titles)
    .values(row)
    .onConflictDoUpdate({ target: [s.titles.tmdbId, s.titles.kind], set: row })
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

// ----------------------------------------------------------------------- run

const built: Partial<Record<Feed, Hydrated[]>> = {};
let failed = false;

for (const feed of FEEDS) {
  let selected: Candidate[];
  try {
    selected = selectFeed(feed, await gather(feed), TODAY);
  } catch (e) {
    console.error(`!! ${feed}: ${(e as Error).message}`);
    failed = true;
    continue;
  }

  const hydrated = (await mapPool(selected, 6, hydrate)).filter((h): h is Hydrated => h !== null);

  /* /new answers "what landed on a service", so a title TMDB no longer lists on
     one has no business in it — it would render under "No tracked service" and
     push a real release off the end of the 200-item feed. Coming soon has not
     landed anywhere yet, so it is kept whatever the providers say. */
  const kept = feed === "new" ? hydrated.filter((h) => h.platforms.length) : hydrated;

  if (!kept.length) {
    console.error(`!! ${feed} came back empty — keeping the feed that is already there`);
    failed = true;
    continue;
  }
  built[feed] = kept.slice(0, LIMIT[feed]);
  console.log(`${feed}: ${kept.length} titles`);
}

/* One transaction for the whole run. A half-written feed is worse than a stale
   one: /new is force-dynamic, so it would render the gap to whoever asked for
   the page in that instant. */
const counts = db.transaction((tx) => {
  const written: [Feed, number][] = [];
  for (const [feed, items] of Object.entries(built) as [Feed, Hydrated[]][]) {
    for (const item of items) saveTitle(tx, item);
    tx.delete(s.feedItems).where(eq(s.feedItems.feed, feed)).run();
    tx.insert(s.feedItems)
      .values(
        items.map((item, position) => ({
          feed,
          tmdbId: item.candidate.tmdbId,
          kind: item.candidate.kind,
          position,
          builtAt: TODAY,
        })),
      )
      .run();
    written.push([feed, items.length]);
  }
  return written;
});

console.log(
  `built ${TODAY}: ${counts.map(([feed, n]) => `${feed} ${n}`).join(", ") || "nothing"}`,
);
if (failed) process.exit(1);
