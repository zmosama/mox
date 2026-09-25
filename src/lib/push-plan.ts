/**
 * What a web notification should say, and whether it is due yet.
 *
 * Pure: given what is coming and what time it is, it answers what to send.
 * The sender (push.ts) runs every few minutes and asks; `key` is what makes
 * each notification go out once however many runs see it due.
 */

export type Outgoing = {
  /** Unique per account: "ep:247718:2026-10-02", "f1:16:race", "arr:movie:603692". */
  key: string;
  title: string;
  body: string;
  /** Where a tap leads, on this site. */
  url: string;
  /** Notifications with the same tag replace one another on the device. */
  tag: string;
};

const CAIRO = "Africa/Cairo";

/**
 * The instant it is `minutes` after midnight on `date` in Cairo — Egypt moves
 * its clocks, so the offset is read for that very day rather than assumed.
 */
export function cairoInstant(date: string, minutes: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return guess - (shown - guess);
}

/** How long after its moment a notification is still worth sending — a server down all morning should not announce Tuesday's episode on Wednesday. */
const GRACE = 6 * 3600_000;

export type EpisodeIn = { tmdbId: number; show: string; season: number; episode: number; airs: string; platforms: string[] };

/** One notification per show per day, at the chosen time, as the app does. */
export function dueEpisodes(episodes: EpisodeIn[], atMinutes: number, now: number): Outgoing[] {
  const batches = new Map<string, EpisodeIn[]>();
  for (const e of episodes) {
    const k = `${e.tmdbId}:${e.airs}`;
    batches.set(k, [...(batches.get(k) ?? []), e]);
  }
  const out: Outgoing[] = [];
  for (const [k, list] of batches) {
    const first = list[0];
    const at = cairoInstant(first.airs, atMinutes);
    if (now < at || now > at + GRACE) continue;
    const last = list[list.length - 1];
    const what = list.length === 1
      ? `S${first.season} E${first.episode} is out`
      : last.season === first.season
        ? `S${first.season} E${first.episode}–E${last.episode} are out`
        : `${list.length} new episodes are out`;
    out.push({
      key: `ep:${k}`,
      title: first.show,
      body: first.platforms[0] ? `${what} — watch it on ${first.platforms[0]}` : `${what} today`,
      url: `/title/tv/${first.tmdbId}`,
      tag: `ep:${first.tmdbId}`,
    });
  }
  return out;
}

export type SessionIn = { round: number; race: string; kind: string; label: string; at: string };

/** A few minutes before qualifying, a sprint or a race — its start, never a result. */
export function dueSessions(sessions: SessionIn[], leadMinutes: number, watchOn: string | null, now: number): Outgoing[] {
  return sessions
    .filter((s) => {
      const start = Date.parse(s.at);
      return now >= start - leadMinutes * 60_000 && now < start;
    })
    .map((s) => ({
      key: `f1:${s.round}:${s.kind}`,
      title: s.race,
      body: `${s.label} in ${Math.max(1, Math.round((Date.parse(s.at) - now) / 60_000))} minutes${watchOn ? ` — live on ${watchOn}` : ""}`,
      url: "/f1",
      tag: "f1",
    }));
}

export type ArrivalIn = { tmdbId: number; kind: string; title: string; provider: string };

export function arrivals(list: ArrivalIn[]): Outgoing[] {
  return list.map((a) => ({
    key: `arr:${a.kind}:${a.tmdbId}`,
    title: a.title,
    body: `Now on ${a.provider} — it's on your watchlist.`,
    url: `/title/${a.kind}/${a.tmdbId}`,
    tag: `arr:${a.kind}:${a.tmdbId}`,
  }));
}
