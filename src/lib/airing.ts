/**
 * The day an episode actually reaches a viewer here.
 *
 * TMDB publishes an air date and no air time, and that date belongs to the
 * network rather than to us: HBO's Sunday 9pm ET is 4am Monday in Cairo. The
 * calendar stored it raw, so every HBO episode sat on the page a day early and
 * then dropped out of "today" at midnight — the same morning it first became
 * watchable. Lanterns S01E06 was filed under Sunday 20 September and was gone
 * from the board by the time it landed on OSN+ at 5:59 on the Monday.
 *
 * Only networks broadcasting in their own American prime time need the shift.
 * A global streamer releases at midnight Pacific, which is mid-morning here on
 * the same date, so Netflix, Apple TV+ and Prime Video are already right and
 * must not be moved. Networks east of us are earlier still.
 *
 * Disney+ is the exception that looked like the rule. Its American originals
 * post at 6pm Pacific on the printed date — 9pm Eastern, the same slot as HBO —
 * so they too reach us in the small hours of the next day. VisionQuest is
 * printed as Tuesday, lands around 4am Wednesday here, and sat on the board a
 * day early every week. TVmaze lists Disney+ with no air time, so the list has
 * to know.
 *
 * The network list below is now the *fallback*. TVmaze publishes a real instant
 * per episode and {@link landsOnStamp} converts it, which needs no list at all
 * and is right about channels nobody would have thought to add: measured
 * against 188 upcoming episodes the list and the timestamps agreed 167 times,
 * and every disagreement where TVmaze knew the air time was the list being
 * wrong — Citytv, CBC, BET and Global TV all broadcast at 20:30 or later and
 * were simply missing from it. The list still decides the rest: TVmaze has no
 * entry for 43% of the shows here, mostly German, Turkish, Chinese and Arabic,
 * and leaves the air time blank on a third of the episodes it does list.
 */
import { addDaysISO, todayISO } from "./dates";
import type { ShowSchedule } from "./tvmaze";

/**
 * Networks whose evening is our small hours.
 *
 * Membership is the one thing to edit when a network turns out to land the same
 * day — the shift is a property of when a channel broadcasts, not something
 * derivable from anything TMDB returns. American streaming services are
 * deliberately absent even though TMDB tags several of them `US`: Hulu and
 * Paramount+ post at midnight Eastern, which is well inside our morning.
 *
 * Anything not named here keeps the raw date. An unknown network behaves
 * exactly as it does today rather than being guessed at in a direction that
 * could be wrong in either its own favour or ours.
 */
const LOCAL_PRIME_NETWORKS: readonly string[] = [
  // Premium cable
  "HBO", "Showtime", "STARZ", "Cinemax", "MGM+", "Epix",
  // Broadcast
  "ABC", "CBS", "NBC", "FOX", "The CW", "PBS", "Telemundo", "Univision",
  // Basic cable
  "AMC", "FX", "FXX", "FXM", "TNT", "TBS", "USA Network", "Syfy", "Bravo",
  "Paramount Network", "Comedy Central", "A&E", "History", "Lifetime",
  "Discovery", "Discovery Channel", "TLC", "National Geographic", "truTV",
  "OWN", "WE tv", "Oxygen", "Investigation Discovery", "TV Land",
  // Kids and late night, which keep their channel's clock
  "Adult Swim", "Cartoon Network", "Nickelodeon", "Disney Channel", "Freeform",
  // Canada, same side of the Atlantic
  "CTV", "CBC",
];

const LOCAL_PRIME = new Set(LOCAL_PRIME_NETWORKS.map((n) => n.toLowerCase()));

/**
 * Streamers that release their American originals in American prime time.
 *
 * Only the shows made in the US move: Disney+'s Korean and Japanese originals
 * drop on their own afternoon, which is the same date here.
 */
const US_PRIME_STREAMERS = new Set(["disney+"]);

/**
 * A network as TMDB lists it. `origin_country` matters because names collide:
 * Japan's TBS and CBC are not America's TBS or Canada's CBC, and matching on
 * the name alone moved every Blue Box and LOST10 episode a day late.
 */
export type Network = { name?: string | null; origin_country?: string | null };

/** Where the networks in {@link LOCAL_PRIME_NETWORKS} broadcast from. */
const LOCAL_PRIME_COUNTRIES = new Set(["US", "CA"]);

/**
 * Whether a show's episodes land here the day after the date TMDB prints.
 *
 * Any match counts rather than only the first network listed: TMDB's air date
 * is the original broadcaster's, and a show co-listed with a streamer is still
 * dated by whichever of them actually put it out at 9pm. A network TMDB places
 * outside North America never matches, whatever it is called; one with no
 * country recorded is taken at its name, as before.
 */
export function airsInLocalPrime(
  networks: Network[] | null | undefined,
  originCountry: readonly string[] | null | undefined = null,
): boolean {
  const american = (originCountry ?? []).includes("US");
  return (networks ?? []).some((n) => {
    const name = n?.name?.toLowerCase();
    if (!name) return false;
    if (n.origin_country && !LOCAL_PRIME_COUNTRIES.has(n.origin_country)) return false;
    return LOCAL_PRIME.has(name) || (american && US_PRIME_STREAMERS.has(name));
  });
}

/**
 * When each streaming service puts an episode up, for TVmaze's entries that
 * carry the service's official day and no time.
 *
 * Times are US Eastern on the official day, and where reports disagree the
 * latest credible one is used, because the one thing a calendar and a
 * notification must never do is send somebody to a service that has nothing on
 * it yet. Apple TV is the example: reports range from 9pm Eastern the night
 * before to midnight Eastern, so midnight it is — 7am in Cairo on the day, at
 * most a few hours after it really appears, never before. A service with a
 * clock published for every release (Netflix: midnight Pacific) is just that.
 *
 * Disney+ depends on where the show was made: its American originals go up at
 * 6pm Pacific on the day, the small hours of the next one here; its Korean and
 * Japanese ones in their own afternoon, well before 3am Eastern.
 *
 * Measured 2026-11-12 against pogdesign's TV Calendar over the 71 episodes both
 * listed: every timed broadcast agreed, and every difference was one of these.
 */
const STREAM_RELEASE: Record<string, string> = {
  "apple tv": "00:00",
  "apple tv+": "00:00",
  netflix: "03:00",
  "prime video": "03:00",
  "amazon prime video": "03:00",
  hulu: "03:00",
  "paramount+": "03:00",
  "hbo max": "03:00",
  max: "03:00",
  peacock: "03:00",
  "disney+": "03:00",
};
const DISNEY_US_RELEASE = "21:00";

/** The instant it is `hhmm` on `date` in `timeZone`, as an ISO stamp. */
export function zonedInstant(date: string, hhmm: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (shown - guess)).toISOString();
}

/**
 * The instant a streaming release goes up, or null for a service whose habit
 * is not known — those are dated the way pogdesign dates them, the official day
 * at 11:59pm Eastern, the next morning here, without claiming an exact time.
 */
export function streamRelease(web: string, officialDay: string, american: boolean): string | null {
  const name = web.toLowerCase();
  const at = name === "disney+" && american ? DISNEY_US_RELEASE : STREAM_RELEASE[name];
  return at ? zonedInstant(officialDay, at, "America/New_York") : null;
}

/**
 * The calendar date an episode becomes watchable here.
 *
 * Takes the shift as a boolean rather than the networks themselves so a caller
 * that resolves it once per show does not pay for it once per episode.
 */
export function landsOn(airDate: string, shifted: boolean): string {
  return shifted ? addDaysISO(airDate, 1) : airDate;
}

/**
 * The same answer, read off a real instant instead of inferred from a list.
 *
 * TVmaze pairs each episode with the broadcaster's timezone, so Lanterns comes
 * back as 21:00 America/New_York — 2026-09-21T01:00Z, which is the 21st here.
 * Only ever called for an episode that carries an air time: with the time blank
 * TVmaze still emits a stamp, but it is a 04:00 UTC placeholder standing in for
 * "unknown", and believing it would quietly assert that nothing ever airs in
 * the evening.
 */
export function landsOnStamp(airstamp: string): string | null {
  const at = new Date(airstamp);
  return Number.isNaN(at.getTime()) ? null : todayISO(at);
}

const dayGap = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * The most TVmaze may move an episode off TMDB's date, and only when the whole
 * season agrees on the move. Dexter: Resurrection streams on Paramount+ on
 * Friday and TMDB prints Showtime's Sunday: two days, every week.
 */
export const MAX_PLATFORM_GAP = 3;

export type Arrived = {
  airs: string;
  /** The instant it goes up, when known: a timed broadcast, or a service with a set release hour. */
  stamp: string | null;
  /** Whether TVmaze decided it, for the run's summary. */
  fromTvmaze: boolean;
};

function compare(episodes: { key: string; airDate: string }[], known: ShowSchedule | null, american: boolean) {
  return episodes.map((e) => {
    const t = known?.get(e.key);
    if (!t) return { ...e, airs: null, stamp: null, gap: null };
    let { airs, stamp } = t;
    if (t.web) {
      stamp = streamRelease(t.web, t.airs, american);
      airs = stamp ? todayISO(new Date(stamp)) : addDaysISO(t.airs, 1);
    }
    return { ...e, airs, stamp, gap: dayGap(e.airDate, airs) };
  });
}

/**
 * Whether a season has a gap that only its history can confirm.
 *
 * TVmaze's schedule covers the future only, so by a season's last week the one
 * episode left is no pattern at all, and the finale of a show that streams two
 * days before TMDB's date would slip back to TMDB's. When this is true the
 * caller fetches the show's full episode list, aired ones included, and asks
 * again with that.
 */
export function needsHistory(
  episodes: { key: string; airDate: string }[],
  known: ShowSchedule | null,
  american: boolean,
): boolean {
  return compare(episodes, known, american).some(
    (c) => c.gap !== null && Math.abs(c.gap) > 1 && Math.abs(c.gap) <= MAX_PLATFORM_GAP,
  );
}

/**
 * When each episode of one season arrives here.
 *
 * TVmaze wins when its date is within a day of TMDB's: a timezone or an
 * evening-before release moves an episode by one calendar day at most.
 *
 * A bigger gap is believed only when it is the season's pattern. Two sources
 * describing different nights for the same number usually means they have
 * numbered the season differently, and then the gap wanders: Big Brother's
 * S28E37 was 21 September in TMDB and 1 October in TVmaze, with neighbours off
 * by other amounts. A gap that is the same every week is something else: one
 * show, released on two platforms on different days, and TMDB picked the later
 * one. So the gap is taken when most of the episodes both sources know share
 * it, at least two of them do, and it is no more than {@link MAX_PLATFORM_GAP}
 * days. The rows here are keyed on TMDB's episode list, so anything less
 * certain than that leaves TMDB's date, moved by the network list.
 *
 * Pass the whole season, not just the episodes on the calendar: the pattern is
 * read off all of them.
 */
export function seasonArrivals(
  episodes: { key: string; airDate: string }[],
  known: ShowSchedule | null,
  shifted: boolean,
  american: boolean,
): Map<string, Arrived> {
  const candidates = compare(episodes, known, american);

  const counts = new Map<number, number>();
  let compared = 0;
  for (const c of candidates) {
    if (c.gap === null) continue;
    compared++;
    counts.set(c.gap, (counts.get(c.gap) ?? 0) + 1);
  }
  let pattern: number | null = null;
  for (const [gap, n] of counts) {
    if (n >= 2 && n * 2 > compared && Math.abs(gap) <= MAX_PLATFORM_GAP) pattern = gap;
  }

  const out = new Map<string, Arrived>();
  for (const c of candidates) {
    const believed = c.gap !== null && (Math.abs(c.gap) <= 1 || c.gap === pattern);
    out.set(
      c.key,
      believed
        ? { airs: c.airs!, stamp: c.stamp, fromTvmaze: true }
        : { airs: landsOn(c.airDate, shifted), stamp: null, fromTvmaze: false },
    );
  }
  return out;
}
