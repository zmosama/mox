/**
 * What belongs in each feed, and in what order.
 *
 * Kept out of the builder script so the windows can be tested without a network
 * or a database: "is a film from three months ago still new" is a product
 * decision, not a fetching detail.
 */
import { addDaysISO } from "./dates";
import type { Feed, MediaKind } from "@/db/schema";

/**
 * How far each feed reaches, in days.
 *
 * `new` is keyed on the release date, not on the day a title landed on a
 * catalogue — TMDB does not publish that — so a film that reaches a service
 * months after release still files under its release date, which is what the
 * timeline has always shown.
 */
export const WINDOW = { new: 60, upcoming: 90 } as const;

/** `new` matches `datedFeed`'s own ceiling; there is no point storing more. */
export const LIMIT: Record<Feed, number> = { new: 200, upcoming: 60, trending: 40 };

export type Candidate = {
  tmdbId: number;
  kind: MediaKind;
  /** Release date for a film, first air date for a series. */
  date: string | null;
  popularity: number;
};

const idOf = (c: Candidate) => `${c.tmdbId}:${c.kind}`;

/**
 * One title can arrive from several TMDB pages — and from both the local and a
 * fallback-region sweep — so the first sighting wins and the rest are dropped.
 */
function unique(items: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(idOf(i)) ? false : (seen.add(idOf(i)), true)));
}

/** The feed's final membership and order. `today` is a Cairo calendar date. */
export function selectFeed(feed: Feed, items: Candidate[], today: string): Candidate[] {
  const pool = unique(items);
  if (feed === "trending") return pool.slice(0, LIMIT.trending);

  /* An undated title cannot be placed on a timeline at all, and /new groups
     strictly by date — one with an empty date collapsed every such title into a
     single unlabelled "Undated" block at the top of the page. */
  const dated = pool.filter((i): i is Candidate & { date: string } => Boolean(i.date));

  if (feed === "new") {
    const from = addDaysISO(today, -WINDOW.new);
    return dated
      .filter((i) => i.date >= from && i.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date) || b.popularity - a.popularity)
      .slice(0, LIMIT.new);
  }

  const until = addDaysISO(today, WINDOW.upcoming);
  return dated
    .filter((i) => i.date > today && i.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date) || b.popularity - a.popularity)
    .slice(0, LIMIT.upcoming);
}

/** The date range to ask TMDB for, per feed. Inclusive at both ends. */
export function windowFor(feed: Feed, today: string) {
  if (feed === "new") return { from: addDaysISO(today, -WINDOW.new), to: today };
  return { from: addDaysISO(today, 1), to: addDaysISO(today, WINDOW.upcoming) };
}
