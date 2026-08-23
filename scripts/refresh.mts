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
import { refreshCalendar } from "./refresh/calendar.mjs";
import { refreshFeeds } from "./refresh/feeds.mjs";
import { refreshServices } from "./refresh/services.mjs";
import { refreshUniverses } from "./refresh/universes.mjs";

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

await step("universes", async () => ({ summary: await refreshUniverses(), value: null }));

if (failed.length) {
  console.error(`\n${failed.length} of 4 steps failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nall four steps current");
