/**
 * Rebuild only the TV calendar, without the rest of the nightly refresh.
 *
 *   node --env-file-if-exists=.env.local node_modules/.bin/tsx scripts/refresh-calendar.mts
 *
 * For right after a change to how episodes are dated, so the calendar does not
 * show the old dates until tonight. The full run is scripts/refresh.mts.
 */
import { refreshCalendar } from "./refresh/calendar.mjs";
import { todayISO } from "../src/lib/dates";

console.log(await refreshCalendar(todayISO()));
