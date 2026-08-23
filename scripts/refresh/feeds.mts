/**
 * Rebuild the three feeds behind /new from TMDB.
 *
 * Nothing wrote to `feed_items` except the one-off legacy import, so /new
 * showed whatever that import happened to leave behind — a timeline whose
 * newest entry got older every day, on a page whose whole job is to say what
 * just landed.
 *
 * All the network work happens before any write, and the table is replaced in a
 * single transaction: /new is force-dynamic and would otherwise render a
 * half-built feed to whoever asked for the page in that instant.
 */
import { eq } from "drizzle-orm";
import {
  catalogue, db, fetchTitle, HOME, mapPool, s, saveTitle, type Fetched,
} from "./shared.mjs";
import type { Feed, MediaKind } from "../../src/db/schema";
import { FEEDS } from "../../src/db/schema";
import { LIMIT, selectFeed, windowFor, type Candidate } from "../../src/lib/feeds";
import { tmdb } from "../../src/lib/tmdb";

/** TMDB pages are 20 items; this is a ceiling, not a target. */
const MAX_PAGES = 5;

type Listed = {
  id: number;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
};

type Page = { results: Listed[]; total_pages: number };

const toCandidate = (item: Listed, kind: MediaKind): Candidate => ({
  tmdbId: item.id,
  kind,
  date: item.release_date || item.first_air_date || null,
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

async function gather(feed: Feed, today: string, services: ReturnType<typeof catalogue>) {
  if (feed === "trending") {
    const body = await tmdb<Page>("/trending/all/week", {});
    return body.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => toCandidate(r, r.media_type as MediaKind));
  }

  /**
   * Discover sweeps, one per watch region.
   *
   * A service not sold locally has no listing under our region at all, so it
   * gets its own sweep in the regions it does exist in — the same fallback the
   * title sheet applies, otherwise Disney Plus never appears in /new no matter
   * how much it adds.
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

  const { from, to } = windowFor(feed, today);
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

export async function refreshFeeds(today: string) {
  const services = catalogue();
  if (!services.length) throw new Error("no services in the catalogue");

  const built: Partial<Record<Feed, Fetched[]>> = {};
  const failures: string[] = [];

  for (const feed of FEEDS) {
    let selected: Candidate[];
    try {
      selected = selectFeed(feed, await gather(feed, today, services), today);
    } catch (e) {
      failures.push(`${feed}: ${(e as Error).message}`);
      continue;
    }

    const fetched = (
      await mapPool(selected, 6, (c) => fetchTitle(c.tmdbId, c.kind, services))
    ).filter((f): f is Fetched => f !== null);

    /* /new answers "what landed on a service", so a title TMDB no longer lists
       on one has no business in it — it would render under "No tracked service"
       and push a real release off the end of the feed. Coming soon has not
       landed anywhere yet, so it is kept whatever the providers say. */
    const kept = feed === "new" ? fetched.filter((f) => f.platforms.length) : fetched;

    /* A feed that came back empty is left exactly as it was. An outage should
       show yesterday's timeline, not an empty one. */
    if (!kept.length) {
      failures.push(`${feed} came back empty — kept the feed already there`);
      continue;
    }
    built[feed] = kept.slice(0, LIMIT[feed]);
  }

  db.transaction((tx) => {
    for (const [feed, items] of Object.entries(built) as [Feed, Fetched[]][]) {
      for (const item of items) saveTitle(tx, item);
      tx.delete(s.feedItems).where(eq(s.feedItems.feed, feed)).run();
      tx.insert(s.feedItems)
        .values(
          items.map((item, position) => ({
            feed,
            tmdbId: item.tmdbId,
            kind: item.kind,
            position,
            builtAt: today,
          })),
        )
        .run();
    }
  });

  const counts = (Object.entries(built) as [Feed, Fetched[]][])
    .map(([feed, items]) => `${feed} ${items.length}`)
    .join(", ");

  if (failures.length) throw new Error(`${counts || "nothing built"}; ${failures.join("; ")}`);

  /** The series /new just surfaced — the calendar step wants them too. */
  const series = (built.new ?? []).filter((f) => f.kind === "tv").map((f) => f.tmdbId);
  return { summary: counts, series };
}
