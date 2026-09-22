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
 * the same date, so Netflix, Apple TV+, Disney+ and Prime Video are already
 * right and must not be moved. Networks east of us are earlier still.
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

export type Network = { name?: string | null };

/**
 * Whether a show's episodes land here the day after the date TMDB prints.
 *
 * Any match counts rather than only the first network listed: TMDB's air date
 * is the original broadcaster's, and a show co-listed with a streamer is still
 * dated by whichever of them actually put it out at 9pm.
 */
export function airsInLocalPrime(networks: Network[] | null | undefined): boolean {
  return (networks ?? []).some((n) => n?.name && LOCAL_PRIME.has(n.name.toLowerCase()));
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

/**
 * Which arrival date to believe for one episode.
 *
 * TVmaze wins when it has a timestamp, but only within a day of the date TMDB
 * printed. A timezone can move a broadcast by one calendar day and never by
 * more, so a bigger gap is not a correction — it means the two databases have
 * numbered the episodes differently and are describing different nights. Big
 * Brother is the example: TMDB's S28E37 is the 21st of September, TVmaze's is
 * the 1st of October, and taking the stamp would have moved an episode eleven
 * days on the strength of a numbering mismatch. The rows here are keyed on
 * TMDB's episode list, so where they disagree about *which* episode it is,
 * TMDB has to win.
 */
export function arrivalOf(
  airDate: string,
  stamped: string | null | undefined,
  shifted: boolean,
): { airs: string; timed: boolean } {
  const plausible =
    stamped != null &&
    (stamped === airDate ||
      stamped === addDaysISO(airDate, 1) ||
      stamped === addDaysISO(airDate, -1));

  return plausible
    ? { airs: stamped, timed: true }
    : { airs: landsOn(airDate, shifted), timed: false };
}
