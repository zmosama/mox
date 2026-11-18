/**
 * A second opinion on when episodes land: MOX's calendar held against
 * pogdesign's TV Calendar, the one he trusted for years and still checks us
 * against (it "never got it wrong").
 *
 * This file only reads and compares. It decides nothing about the calendar:
 * `airing.ts` and TVmaze still date every episode, and nothing here writes a
 * date. What comes out is a short list of the episodes worth a look before he
 * goes to watch them — above all the one failure he hates, MOX saying an
 * episode is out before it is.
 *
 * Reading pogdesign, with no account and so in UTC:
 *
 *  - the month page lists every episode under its day, with no times;
 *  - a day page adds "Airs: 1:00am - 2:00am on NBC" to each.
 *
 * An entry is one of two kinds, and the difference is the whole trick:
 *
 *  - **timed** — a real broadcast. Its instant, moved to Cairo, is the day it
 *    lands here, and MOX should say the same day.
 *  - **day only** — pogdesign has no hour for it and prints 11:59pm US Eastern
 *    on the official day, as a cautious placeholder (which is why it never
 *    announces anything early). Nearly every streaming release is like this,
 *    and so are a few broadcasts. Taken as a real time it lands "tomorrow
 *    morning" here and every Netflix episode would look a day early in MOX.
 *    It is read as what it is: an official day. MOX is early only if it says
 *    a day before that one.
 *
 * Measured 2026-11-18 over ten days of pages: every streaming service's rows
 * sat at 11:59pm Eastern, apart from a few Prime Video and Disney+ rows at
 * 11:00pm and Paramount+ at 11:30pm — placeholders of the same kind — and two
 * Peacock rows at 9 and 10pm, which are real simulcasts.
 */
import { todayISO } from "./dates";

const EASTERN = "America/New_York";

/** Services that publish a day and not an hour; pogdesign's late-evening time for them is a placeholder. */
const STREAMERS = new Set([
  "netflix", "apple tv", "apple tv+", "disney+", "amazon prime video", "prime video", "hulu", "paramount+",
  "hbo max", "max", "peacock", "discovery+", "mgm+", "hallmark+", "angel.com", "crunchyroll", "shudder", "britbox", "acorn tv",
]);

/** One episode as pogdesign lists it. `day` is the UTC date of the page it sits on. */
export type Listed = { show: string; slug: string; season: number; episode: number; day: string };
/** The same, from a day page: with its start (an ISO instant) and where it airs, when the page says. */
export type Aired = Listed & { at: string | null; network: string | null };

const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const iso = (y: string | number, m: string | number, d: string | number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Whether the page was served in UTC. It is, to anyone with no account; if
 * that ever changes every time on it means something else, and the night's
 * answer must be "could not check", never "all clear".
 */
export const inUtc = (html: string) => /<option[^>]*value="GMT"[^>]*selected/i.test(html);

/** A month page: every episode of the month, by day. */
export function parseMonth(html: string): Listed[] {
  const out: Listed[] = [];
  // Each day's box runs to the next day's.
  const days = html.split(/<div id="d_(\d{1,2})_(\d{1,2})_(\d{4})"/);
  for (let i = 1; i + 3 < days.length; i += 4) {
    const day = iso(days[i + 2], days[i + 1], days[i]);
    const body = days[i + 3] ?? "";
    const entry = /<a href="([^"/]+)-summary"[^>]*>([\s\S]*?)<\/a>\s*<a href="[^"]*\/Season-(\d+)\/Episode-(\d+)"/g;
    for (let m = entry.exec(body); m; m = entry.exec(body)) {
      out.push({ slug: m[1], show: text(m[2]), season: Number(m[3]), episode: Number(m[4]), day });
    }
  }
  return out;
}

/** "1:00am" on a UTC date, as an instant. */
function utcInstant(day: string, h: number, min: number, half: string): string {
  const hour = (h % 12) + (half.toLowerCase() === "pm" ? 12 : 0);
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00Z`).toISOString();
}

/** A day page: that UTC day's episodes with their times. */
export function parseDay(html: string, day: string): Aired[] {
  const out: Aired[] = [];
  const box = /<h4><a href="\/cat\/([^"]+)-summary">([\s\S]*?)<\/a>\s*<span>Season (\d+), Episode (\d+)<\/span><\/h4>([\s\S]*?)(?=<h4>|$)/g;
  for (let m = box.exec(html); m; m = box.exec(html)) {
    const airs = /<strong>Airs:<\/strong>\s*(\d{1,2}):(\d{2})\s*(am|pm)(?:\s*-\s*[^<]*?)?(?:\s+on\s+([^<]+))?<\/p>/i.exec(m[5]);
    out.push({
      slug: m[1], show: text(m[2]), season: Number(m[3]), episode: Number(m[4]), day,
      at: airs ? utcInstant(day, Number(airs[1]), Number(airs[2]), airs[3]) : null,
      network: airs?.[4] ? text(airs[4]) : null,
    });
  }
  return out;
}

/** The clock in US Eastern at an instant, as "HH:MM", and the date there. */
function eastern(at: string): { hhmm: string; date: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: EASTERN, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { hhmm: `${get("hour")}:${get("minute")}`, date: todayISO(new Date(at), EASTERN) };
}

/** What pogdesign is really saying about one episode. */
export type Theirs =
  /** A real broadcast: the instant, and the date that is in Cairo. */
  | { kind: "timed"; at: string; lands: string }
  /** Only an official day (US Eastern); no hour is claimed. */
  | { kind: "day"; officialDay: string };

export function theirsOf(e: Aired): Theirs {
  // No time on the page at all: the page's own day is all there is.
  if (!e.at) return { kind: "day", officialDay: e.day };
  const { hhmm, date } = eastern(e.at);
  /* 11:59pm Eastern is the placeholder whoever airs it. A streaming service
     at 11pm or later is one too: no service puts an episode up at a
     broadcaster's late-night hour, and reading it as real would call every
     one of them a day early in MOX. */
  const placeholder = hhmm === "23:59" || (hhmm >= "23:00" && STREAMERS.has((e.network ?? "").toLowerCase()));
  return placeholder ? { kind: "day", officialDay: date } : { kind: "timed", at: e.at, lands: todayISO(new Date(e.at)) };
}

/** A show's name with what differs between catalogues taken out: case, punctuation, a leading "the", a year or country in brackets. */
export function foldShow(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/['’`.]/g, "")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

/** An episode on MOX's calendar. `airsAt` is the instant a notification goes out, when there is one. */
export type Mine = { tmdbId: number; show: string; season: number; episode: number; airs: string; airsAt: number | null };

export type Finding = {
  tmdbId: number;
  show: string;
  season: number;
  episode: number;
  /** The day MOX says. Null only for `missing`. */
  mine: string | null;
  /**
   * - early: MOX says a day before pogdesign does. The one that matters.
   * - early_notice: the same day, but MOX's notification would go out well before it airs.
   * - late: MOX says later than pogdesign. He would only be told late.
   * - missing: pogdesign lists an episode of a show he follows this week and MOX has no such episode.
   * - spread: MOX has a season out all at once and pogdesign lists it one episode a day. Not an alarm: see {@link settle}.
   * - unverified: pogdesign has nothing to hold it against.
   */
  kind: "early" | "early_notice" | "late" | "missing" | "spread" | "unverified";
  /** The day pogdesign means, in Cairo for a timed broadcast, the official day otherwise. */
  theirs: string | null;
  /** Their instant, for a timed broadcast. */
  theirsAt: string | null;
  network: string | null;
  /** Why, in a few plain words, for the report's writer and for him. */
  detail: string;
};

/** The gap, in whole days, from one ISO date to another. */
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** How far before a broadcast a notification may go without being called early. */
const NOTICE_SLACK_S = 45 * 60;

/** One of MOX's episodes against pogdesign's entry for it. Null means they agree. */
export function judge(mine: Mine, theirs: Aired): Finding | null {
  const t = theirsOf(theirs);
  const base = { tmdbId: mine.tmdbId, show: mine.show, season: mine.season, episode: mine.episode, mine: mine.airs, network: theirs.network };
  if (t.kind === "timed") {
    const gap = days(mine.airs, t.lands);
    const at = { theirs: t.lands, theirsAt: t.at };
    if (gap > 0) return { ...base, ...at, kind: "early", detail: `MOX says ${mine.airs}; it airs ${t.at} (${theirs.network ?? "?"}), which is ${t.lands} in Cairo` };
    if (gap < 0) return { ...base, ...at, kind: "late", detail: `MOX says ${mine.airs}; it airs ${t.at}, which is already ${t.lands} in Cairo` };
    if (mine.airsAt && Date.parse(t.at) / 1000 - mine.airsAt > NOTICE_SLACK_S) {
      return { ...base, ...at, kind: "early_notice", detail: `Same day, but MOX would notify at ${new Date(mine.airsAt * 1000).toISOString()} and it airs at ${t.at}` };
    }
    return null;
  }
  /* Day only. The official day is Eastern; an episode put up that day reaches
     Cairo the same date or, late in the American evening, the next one. So
     MOX may say that day or the day after, and is early only before it. */
  const gap = days(t.officialDay, mine.airs);
  const their = { theirs: t.officialDay, theirsAt: null };
  if (gap < 0) return { ...base, ...their, kind: "early", detail: `MOX says ${mine.airs}; the official day is ${t.officialDay} (${theirs.network ?? "?"}, no hour published)` };
  if (gap > 1) return { ...base, ...their, kind: "late", detail: `MOX says ${mine.airs}; the official day is ${t.officialDay} (${theirs.network ?? "?"})` };
  return null;
}

export type Compared = { findings: Finding[]; agreed: number; checked: number };

/**
 * The whole comparison.
 *
 * @param mine      MOX's episodes in the days being checked
 * @param known     every "SxE" MOX has for each show and its date, at any date — so "missing" is never said of an episode MOX simply dates elsewhere
 * @param slugOf    which pogdesign show each of his shows is, by tmdb id; a show not in it could not be found there
 * @param listed    pogdesign's month(s)
 * @param aired     the day pages read so far, by "slug season episode"
 * @param window    the Cairo dates being checked, first and last
 */
export function compare(
  mine: Mine[],
  known: Map<number, Map<string, string>>,
  slugOf: Map<number, string>,
  listed: Listed[],
  aired: Map<string, Aired>,
  window: { from: string; to: string },
  names: Map<number, string> = new Map(),
): Compared {
  const findings: Finding[] = [];
  let agreed = 0;
  let checked = 0;
  const listedBy = new Map<string, Listed>();
  for (const l of listed) listedBy.set(airKey(l.slug, l.season, l.episode), l);

  for (const m of mine) {
    const slug = slugOf.get(m.tmdbId);
    const base = { tmdbId: m.tmdbId, show: m.show, season: m.season, episode: m.episode, mine: m.airs, theirs: null, theirsAt: null, network: null };
    if (!slug) {
      findings.push({ ...base, kind: "unverified", detail: "pogdesign does not list this show" });
      continue;
    }
    const key = airKey(slug, m.season, m.episode);
    const there = aired.get(key);
    if (!there) {
      /* No day page for it — it is further off than the days that were read,
         or that page failed. The month still says roughly when: its day is
         within one of the truth either way, so two days or more apart is a
         real difference, and anything closer is left unsaid. */
      const about = listedBy.get(key)?.day;
      const gap = about ? days(m.airs, about) : 0;
      if (about && gap >= 2) {
        checked++;
        findings.push({ ...base, theirs: about, kind: "early", detail: `MOX says ${m.airs}; pogdesign has it around ${about}, ${gap} days later` });
      } else if (about && gap <= -2) {
        checked++;
        findings.push({ ...base, theirs: about, kind: "late", detail: `MOX says ${m.airs}; pogdesign has it around ${about}, ${-gap} days earlier` });
      } else {
        findings.push({
          ...base, kind: "unverified",
          detail: about ? "pogdesign lists it near this date, but its page could not be read" : "pogdesign lists the show but not this episode in the months read (it may number the season differently)",
        });
      }
      continue;
    }
    checked++;
    const f = judge(m, there);
    if (f) findings.push(f);
    else agreed++;
  }

  // What pogdesign has this week for a show he follows that MOX has no row for at all.
  const showOf = new Map([...slugOf].map(([id, slug]) => [slug, id]));
  for (const l of listed) {
    const tmdbId = showOf.get(l.slug);
    if (tmdbId === undefined || l.day < window.from || l.day > window.to) continue;
    if (known.get(tmdbId)?.has(`${l.season}x${l.episode}`)) continue;
    const there = aired.get(airKey(l.slug, l.season, l.episode));
    const t = there ? theirsOf(there) : null;
    findings.push({
      tmdbId, show: names.get(tmdbId) ?? l.show, season: l.season, episode: l.episode, mine: null, kind: "missing",
      theirs: t ? (t.kind === "timed" ? t.lands : t.officialDay) : l.day,
      theirsAt: t?.kind === "timed" ? t.at : null,
      network: there?.network ?? null,
      detail: "pogdesign lists this episode this week and MOX's calendar does not have it",
    });
  }
  return { findings: settle(findings, mine, known, slugOf, listed), agreed, checked };
}

/**
 * Two ways the calendars differ that are not MOX being early or late, taken
 * out of the alarms after the comparison.
 *
 * **Numbered differently.** pogdesign counts a season one episode ahead of
 * TMDB (a special, a double episode), so MOX's episode 9 is its episode 10
 * and "episode 9" there is last week's. It shows as: on the day MOX gives,
 * pogdesign has another episode of the show, one MOX does not have on that
 * day. Then the two are not talking about the same episode, and nothing can
 * be said. (Blood of My Blood read as "a week late" this way.)
 *
 * **A season released at once.** MOX has several episodes of a season on one
 * day — as TVmaze and TMDB both publish a binge release — and pogdesign lists
 * the same episodes one a day from that day on. Seen 2026-11-18 with Blade
 * Runner 2099: all eight on 25 November in both of MOX's sources, the 25th
 * to 2 December on pogdesign. Which is right is not known from here, but a
 * run of consecutive days is how a list looks when it has no real dates, so
 * it is shown to him as its own thing and nobody is woken for it.
 */
function settle(findings: Finding[], mine: Mine[], known: Map<number, Map<string, string>>, slugOf: Map<number, string>, listed: Listed[]): Finding[] {
  const near = (a: string, b: string) => Math.abs(days(a, b)) <= 1;
  const out = findings.map((f): Finding => {
    /* The other face of it: the episode pogdesign has this week "and MOX does
       not" is one MOX has that very day under another number. */
    if (f.kind === "missing" && f.theirs && [...(known.get(f.tmdbId)?.values() ?? [])].some((d) => near(d, f.theirs!))) {
      return { ...f, kind: "unverified", detail: `MOX has an episode of this show that day under another number than ${f.season}x${f.episode}: pogdesign numbers the season differently` };
    }
    if ((f.kind !== "early" && f.kind !== "late") || !f.mine) return f;
    const slug = slugOf.get(f.tmdbId);
    const dates = known.get(f.tmdbId);
    const other = listed.find((l) => {
      if (l.slug !== slug || (l.season === f.season && l.episode === f.episode) || !near(l.day, f.mine!)) return false;
      const there = dates?.get(`${l.season}x${l.episode}`);
      return !there || !near(there, l.day);
    });
    return other
      ? { ...f, kind: "unverified", detail: `pogdesign has ${other.season}x${other.episode} of this show on that day, not ${f.season}x${f.episode}: it numbers the season differently, so the two cannot be compared` }
      : f;
  });

  // Seasons MOX has on one day: three episodes or more, to be a release and not a double bill.
  const sameDay = new Map<string, Mine[]>();
  for (const m of mine) sameDay.set(`${m.tmdbId} ${m.season} ${m.airs}`, [...(sameDay.get(`${m.tmdbId} ${m.season} ${m.airs}`) ?? []), m]);
  for (const [, eps] of sameDay) {
    if (eps.length < 3) continue;
    const slug = slugOf.get(eps[0].tmdbId);
    const theirDay = (m: Mine) => listed.find((l) => l.slug === slug && l.season === m.season && l.episode === m.episode)?.day;
    const run = [...eps].sort((a, b) => a.episode - b.episode).map(theirDay);
    // Every one listed, each a day after the one before.
    if (run.some((d) => !d) || !run.every((d, i) => i === 0 || days(run[i - 1]!, d!) === 1)) continue;
    for (let i = 0; i < out.length; i++) {
      const f = out[i];
      if (f.kind === "early" && f.tmdbId === eps[0].tmdbId && f.season === eps[0].season && f.mine === eps[0].airs) {
        out[i] = { ...f, kind: "spread", detail: `MOX has ${eps.length} episodes of this season on ${f.mine}, as a season released at once; pogdesign lists them one a day (${run[0]} to ${run.at(-1)})` };
      }
    }
  }
  return out;
}

export const airKey = (slug: string, season: number, episode: number) => `${slug} ${season} ${episode}`;

/** The findings he should be told about without asking. */
export const isAlarm = (f: Finding) => f.kind === "early" || f.kind === "early_notice" || f.kind === "missing";

/** The report in one line, when no model is there to write it. */
export function plainSummary(c: Compared, status: "ok" | "unchecked"): string {
  if (status === "unchecked") return "ماقدرتش أراجع المواعيد النهارده: صفحة pogdesign ماتقرتش.";
  const n = (k: Finding["kind"]) => c.findings.filter((f) => f.kind === k).length;
  const parts = [
    n("early") + n("early_notice") ? `${n("early") + n("early_notice")} حلقة MOX ممكن يعلن عنها بدري` : "",
    n("missing") ? `${n("missing")} حلقة موجودة في pogdesign ومش عندنا` : "",
    n("late") ? `${n("late")} حلقة MOX متأخر فيها` : "",
    n("spread") ? `${n("spread")} حلقة من موسم نازل مرة واحدة و pogdesign موزّعه على أيام` : "",
    n("unverified") ? `${n("unverified")} حلقة مالقيتلهاش مرجع` : "",
  ].filter(Boolean);
  return parts.length ? `راجعت ${c.checked + n("unverified")} حلقة: ${parts.join("، ")}.` : `راجعت ${c.checked} حلقة وكلها مطابقة لـ pogdesign.`;
}
