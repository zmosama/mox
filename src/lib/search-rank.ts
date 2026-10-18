/**
 * The order search answers in.
 *
 * Search used to be "every word matches somewhere, most-voted first", so
 * "the love h" put Dr. Strangelove (the… love… How) above The Love
 * Hypothesis — the film actually being typed, out this year and on a service
 * you pay for. How well the name matches what was typed counts most, then
 * whether you can watch it tonight, how new it is, and how well known.
 */
import { foldArabic } from "./arabic";

export type Rankable = {
  title: string;
  /** The original-language title, when it differs. */
  originalTitle?: string | null;
  year: number | null;
  votes?: number | null;
  /** On one of the viewer's services. */
  mine?: boolean;
};

/** Lowercase words, punctuation and accents gone: "Dr. Strangelove or:" → "dr strangelove or". */
export function normalise(s: string): string {
  return foldArabic(s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase())
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * How well a title's name answers what was typed, 0–5.
 *
 * The last word typed is unfinished ("the love h"), so it only has to start a
 * word; every word before it has to be whole.
 */
export function matchQuality(name: string, typed: string): number {
  const t = normalise(name);
  const q = normalise(typed);
  if (!q || !t) return 0;
  if (t === q) return 5;
  // Typed as the start of the name: "the love h" → The Love Hypothesis.
  if (t.startsWith(q)) return 4;
  // "The" left off: "love hyp" → The Love Hypothesis.
  if (t.replace(/^(the|a|an) /, "").startsWith(q)) return 4;
  // The whole phrase at the start of any word: "knight ri" → The Dark Knight Rises.
  if ((" " + t).includes(" " + q)) return 3;

  const words = q.split(" ");
  const have = t.split(" ");
  const last = words.length - 1;
  const hit = (w: string, i: number) => have.some((h) => (i === last ? h.startsWith(w) : h === w));
  // Every word, in any order, the last one as a prefix.
  if (words.every(hit)) return 2;
  // Every word somewhere as a prefix — the old, loose rule.
  if (words.every((w) => have.some((h) => h.startsWith(w)))) return 1;
  return 0;
}

/**
 * The same list, best answer first. Stable for equals, so the source's own
 * order (most-voted) breaks the last ties.
 */
export function rankResults<T extends Rankable>(items: T[], typed: string, thisYear = new Date().getFullYear()): T[] {
  const scored = items.map((item, i) => {
    const quality = Math.max(matchQuality(item.title, typed), item.originalTitle ? matchQuality(item.originalTitle, typed) : 0);
    // Known, and recent: a log of votes so a classic still beats an unknown,
    // plus up to three points for the last few years.
    const age = item.year ? Math.max(0, thisYear - item.year) : 30;
    const standing = Math.log10((item.votes ?? 0) + 10) + Math.max(0, 3 - age * 0.75) + (item.mine ? 3 : 0);
    // Weighed together rather than match first: an exact "Stranger" nobody
    // has heard of must not bury Stranger Things.
    return { item, i, score: quality * 2 + standing };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.item);
}
