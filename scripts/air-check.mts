/**
 * Run only the check of episode dates against pogdesign, without the rest of
 * the nightly refresh.
 *
 *   node --env-file-if-exists=.env.local node_modules/.bin/tsx scripts/air-check.mts
 *   node --env-file-if-exists=.env.local node_modules/.bin/tsx scripts/air-check.mts --everyone
 *
 * As it runs each night it covers the series the owner follows, saves the
 * report for his admin page and notifies him of anything announced too early.
 * `--everyone` instead holds the whole calendar against pogdesign, prints what
 * differs and saves nothing: the way to test a change to how episodes are
 * dated (airing.ts), where any "early" is a bug until shown otherwise.
 */
import { refreshAirCheck } from "./refresh/air-check.mjs";
import { todayISO } from "../src/lib/dates";

console.log(await refreshAirCheck(todayISO(), { everyone: process.argv.includes("--everyone") }));
process.exit(0);
