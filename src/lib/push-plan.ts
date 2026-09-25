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
  /**
   * The per-show, per-day keys ("ep:247718:2026-10-02") a notification
   * announces, so a show announced in one grouping is never announced again
   * in another — say, untimed at first and given an air time later.
   */
  covers?: string[];
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

export type EpisodeIn = {
  tmdbId: number;
  show: string;
  season: number;
  episode: number;
  airs: string;
  /** Unix seconds, when the exact arrival is known. */
  airsAt?: number | null;
  platforms: string[];
};

export const episodeKey = (e: Pick<EpisodeIn, "tmdbId" | "airs">) => `ep:${e.tmdbId}:${e.airs}`;

/** "S2 E3 is out", or "S1 E1–E8 are out" for a season dropped at once. */
function what(list: EpisodeIn[]) {
  const first = list[0];
  const last = list[list.length - 1];
  if (list.length === 1) return `S${first.season} E${first.episode} is out`;
  return last.season === first.season
    ? `S${first.season} E${first.episode}–E${last.episode} are out`
    : `${list.length} new episodes are out`;
}

/**
 * When each episode is announced.
 *
 * An episode with a known air time is announced when it lands — at five in
 * the morning if that is when it lands: people wait up for these. The rest,
 * whose day alone is known, wait for the time chosen in Settings.
 *
 * Whatever lands at the same moment goes out as one notification, so ten
 * shows dropping at ten o'clock are one ding, not ten; and one show's whole
 * season arriving at once is one line.
 */
export function dueEpisodes(episodes: EpisodeIn[], atMinutes: number, now: number): Outgoing[] {
  // The moment each show's episodes of a day are announced.
  const shows = new Map<string, { at: number; list: EpisodeIn[] }>();
  for (const e of episodes) {
    const k = episodeKey(e);
    const at = e.airsAt ? e.airsAt * 1000 : cairoInstant(e.airs, atMinutes);
    const entry = shows.get(k) ?? { at, list: [] };
    entry.list.push(e);
    entry.at = Math.min(entry.at, at);
    shows.set(k, entry);
  }

  // Shows announced at the same minute share a notification.
  const moments = new Map<number, { key: string; list: EpisodeIn[] }[]>();
  for (const [key, { at, list }] of shows) {
    const minute = Math.floor(at / 60_000) * 60_000;
    moments.set(minute, [...(moments.get(minute) ?? []), { key, list }]);
  }

  const out: Outgoing[] = [];
  for (const [at, group] of moments) {
    if (now < at || now > at + GRACE) continue;
    const covers = group.map((g) => g.key);
    if (group.length === 1) {
      const list = group[0].list;
      const first = list[0];
      out.push({
        key: covers[0],
        title: first.show,
        body: first.platforms[0] ? `${what(list)} — watch it on ${first.platforms[0]}` : `${what(list)} today`,
        url: `/title/tv/${first.tmdbId}`,
        tag: `ep:${first.tmdbId}`,
        covers,
      });
    } else {
      const names = group.map((g) => g.list[0].show);
      out.push({
        key: `eps:${at}`,
        title: `${group.length} new episodes`,
        body: names.length > 4 ? `${names.slice(0, 4).join(", ")} and ${names.length - 4} more` : names.join(", "),
        url: "/",
        tag: `eps:${at}`,
        covers,
      });
    }
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
