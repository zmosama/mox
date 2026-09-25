/**
 * Age ratings: what a title is rated, in five levels anyone can choose from.
 *
 * TMDB carries each country's own certificate. Egypt's are almost never
 * there, so the American ones are read first — the most complete — and the
 * British ones stand in when a title has no American rating. Both are folded
 * into five levels, because nobody wants to learn two alphabets to say
 * "nothing over 13".
 *
 * A title with no certificate anywhere is "unrated", which is not a level:
 * it is shown by default (a great deal of Arabic and Asian work has none) and
 * hidden only if the viewer asks for that.
 */
import type { MediaKind } from "@/db/schema";

export const AGE_LEVELS = ["all", "7", "pg", "13", "18"] as const;
export type AgeLevel = (typeof AGE_LEVELS)[number];

export const AGE_LABEL: Record<AgeLevel, string> = {
  all: "All ages",
  "7": "7+",
  pg: "PG",
  "13": "13+",
  "18": "18+",
};

/** What each level means, for the settings screen. */
export const AGE_HINT: Record<AgeLevel, string> = {
  all: "G · TV-Y · TV-G",
  "7": "TV-Y7",
  pg: "PG · TV-PG",
  "13": "PG-13 · TV-14",
  "18": "R · NC-17 · TV-MA",
};

const US: Record<string, AgeLevel> = {
  G: "all", "TV-Y": "all", "TV-G": "all",
  "TV-Y7": "7", "TV-Y7-FV": "7",
  PG: "pg", "TV-PG": "pg",
  "PG-13": "13", "TV-14": "13",
  R: "18", "NC-17": "18", "TV-MA": "18",
};

/* The British scale, for titles America never rated. 15 is read as 18+: it is
   closer to R than to PG-13, and erring towards caution is the point of a
   filter someone switched on. */
const GB: Record<string, AgeLevel> = {
  U: "all", PG: "pg", "12": "13", "12A": "13", "15": "18", "18": "18", R18: "18",
};

type ReleaseDates = { results?: { iso_3166_1: string; release_dates?: { certification?: string; type?: number }[] }[] };
type ContentRatings = { results?: { iso_3166_1: string; rating?: string }[] };

export type CertSource = {
  release_dates?: ReleaseDates;
  content_ratings?: ContentRatings;
};

/** A title's level, from TMDB's release dates (films) or content ratings (series); null when unrated. */
export function ageLevel(kind: MediaKind, d: CertSource): AgeLevel | null {
  for (const [country, scale] of [["US", US], ["GB", GB]] as const) {
    const cert = kind === "movie"
      ? (d.release_dates?.results ?? [])
          .find((r) => r.iso_3166_1 === country)?.release_dates
          // Theatrical first, then digital, then anything that has one.
          ?.slice()
          .sort((a, b) => rank(a.type) - rank(b.type))
          .map((r) => r.certification?.trim())
          .find((c) => c && scale[c.toUpperCase()])
      : (d.content_ratings?.results ?? [])
          .find((r) => r.iso_3166_1 === country)?.rating?.trim();
    const level = cert ? scale[cert.toUpperCase()] : undefined;
    if (level) return level;
  }
  return null;
}

const rank = (type?: number) => (type === 3 ? 0 : type === 4 ? 1 : type === 2 ? 2 : 3);

/** The appends that bring a title's certificates along with the rest of it. */
export const certAppend = (kind: MediaKind) => (kind === "movie" ? "release_dates" : "content_ratings");

/**
 * Whether a viewer who allows `allowed` (and does or does not hide unrated
 * titles) should see a title at `level`.
 */
export function allows(allowed: readonly AgeLevel[], hideUnrated: boolean, level: AgeLevel | null): boolean {
  if (level === null) return !hideUnrated;
  return allowed.includes(level);
}

/** Every level allowed and nothing hidden: the filter is off and costs nothing. */
export const filterOff = (allowed: readonly AgeLevel[], hideUnrated: boolean) =>
  !hideUnrated && AGE_LEVELS.every((l) => allowed.includes(l));
