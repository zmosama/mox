/**
 * Fetching TVmaze's schedule. What it means lives in `src/lib/tvmaze.ts`.
 *
 * TMDB publishes an episode's date and never its time, and that date is the
 * broadcaster's own — which is how an HBO Sunday ended up on the board as our
 * Sunday and vanished on the Monday morning it actually arrived. Correcting it
 * from a list of networks works, but only for networks somebody remembered to
 * list. TVmaze carries the broadcaster's timezone with every episode, so the
 * arrival date becomes arithmetic rather than a guess.
 *
 * The whole future schedule is one request. Per-show lookups would have been
 * around two hundred against an API asking for twenty calls per ten seconds, so
 * the nightly run would have grown by minutes; `/schedule/full` is 12MB and
 * about two seconds, and everything after it is a map lookup.
 */
import { indexSchedule, type ScheduleEntry, type Schedule } from "../../src/lib/tvmaze";

const SCHEDULE = "https://api.tvmaze.com/schedule/full";

/** TVmaze asks that clients identify themselves. */
const UA = "mox/1.0 (personal streaming calendar)";

export async function fetchSchedule(): Promise<Schedule> {
  const res = await fetch(SCHEDULE, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`TVmaze ${res.status} on /schedule/full`);
  return indexSchedule((await res.json()) as ScheduleEntry[]);
}
