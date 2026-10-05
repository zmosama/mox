/**
 * Bring everything the site shows up to date from TMDB.
 *
 *   npm run refresh
 *
 * The deploy schedules this nightly (deploy/launchd/refresh.plist.template) and
 * it is safe to run by hand at any time. Everything here was a fixed list left
 * behind by a one-off legacy import: the release timeline stopped at the day of
 * the import, the calendar would have emptied five weeks later, the service
 * catalogue only moved when somebody remembered to run a script, and the MCU
 * ended at whatever had been released that week.
 *
 * Each step is independent. One that fails is reported and the run carries on,
 * because a calendar that could not be reached is no reason to leave the
 * release timeline stale as well — and every step refuses to replace real data
 * with an empty answer, so a bad night shows yesterday's site, never a blank one.
 */
import { todayISO } from "../src/lib/dates";
import { pruneCache } from "../src/lib/tmdb";
import { refreshWatchLinks } from "../src/lib/watch-links";
import { catalogSize, enrichCatalog, mapImdb, packOldDetails, seedCatalog } from "../src/lib/catalog";
import { refreshCalendar } from "./refresh/calendar.mjs";
import { refreshFeeds } from "./refresh/feeds.mjs";
import { refreshServices } from "./refresh/services.mjs";
import { refreshPrices } from "./refresh/prices.mjs";
import { refreshStore } from "./refresh/store.mjs";
import { refreshUniverses } from "./refresh/universes.mjs";
import { refreshFeatures, refreshPicks } from "./refresh/taste.mjs";
import { refreshWatchlist } from "./refresh/watchlist.mjs";
import { refreshAges } from "./refresh/ages.mjs";

const TODAY = todayISO();
const failed: string[] = [];

/** Runs one step, reports it, and never lets its failure end the run. */
async function step<T>(
  name: string,
  run: () => Promise<{ summary: string; value: T }>,
): Promise<T | null> {
  const started = Date.now();
  try {
    const { summary, value } = await run();
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${name.padEnd(10)} ${summary} (${secs}s)`);
    return value;
  } catch (e) {
    console.error(`${name.padEnd(10)} FAILED — ${(e as Error).message}`);
    failed.push(name);
    return null;
  }
}

console.log(`refreshing for ${TODAY}`);

// The catalogue first: the feeds ask TMDB about the services in it, so a
// service added today should be one the same run can already find titles on.
await step("services", async () => ({ summary: await refreshServices(), value: null }));

const feeds = await step("feeds", async () => {
  const { summary, series } = await refreshFeeds(TODAY);
  return { summary, value: series };
});

// The series /new just surfaced are shows worth having on the calendar, so this
// runs after the feeds rather than beside them.
await step("calendar", async () => ({
  summary: await refreshCalendar(TODAY, feeds ?? []),
  value: null,
}));

// What people are waiting for, so the app can say when it arrives.
await step("watchlist", async () => ({ summary: await refreshWatchlist(), value: null }));

// After every step that brings certificates along, so this only sweeps the rest.
await step("ages", async () => ({ summary: await refreshAges(), value: null }));

await step("universes", async () => ({ summary: await refreshUniverses(), value: null }));

// After everything that adds titles: features for what has just become
// watchable, then each person's picks scored against them. Once a night,
// because building the taste model is far too slow to do on a request.
await step("features", async () => ({ summary: await refreshFeatures(), value: null }));
await step("picks", async () => ({ summary: await refreshPicks(TODAY), value: null }));

// The shops. Independent of the feeds: what is for sale answers a different
// question from what was released, and is recorded rather than filtered.
await step("store", async () => ({ summary: await refreshStore(TODAY), value: null }));

// After the store: pricing asks about the films that step just decided are
// recent arrivals, so it has to know which those are.
await step("prices", async () => ({ summary: await refreshPrices(TODAY), value: null }));

// MOX's own catalogue: take in what is already known, then open the titles
// only ever seen in a list, so they gain their full record.
await step("catalog", async () => {
  const packed = packOldDetails();
  const seeded = seedCatalog();
  // IMDb's most-voted titles first, so tonight's enrichment can fill them in.
  const mapped = await mapImdb();
  const { filled, failed: missed } = await enrichCatalog();
  const size = catalogSize();
  return {
    summary: `${packed ? `${packed} records compressed, ` : ""}${seeded} new from titles and ratings, ${mapped.found} found from IMDb (${mapped.missing} not on TMDB), ` +
      `${filled} filled in${missed ? `, ${missed} failed` : ""}; ` +
      `${size.fullTitles} of ${size.titles} titles and ${size.fullPeople} of ${size.people} people complete`,
    value: null,
  };
});

// Each service's link to every title somebody could play, so Play opens the
// service's app on the title (src/lib/watch-links.ts).
await step("links", async () => {
  const { asked, withLinks, failed: missed } = await refreshWatchLinks();
  return { summary: `${asked} titles asked, ${withLinks} with links${missed ? `, ${missed} unanswered` : ""}`, value: null };
});

// Last, and after everything that might have wanted a warm cache this run.
await step("cache", async () => {
  const { removed, freed } = await pruneCache();
  return { summary: `${removed} stale entries dropped, ${(freed / 1e6).toFixed(1)}MB freed`,
           value: null };
});

if (failed.length) {
  console.error(`\n${failed.length} of 13 steps failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nall steps current");
