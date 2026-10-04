/**
 * Ten titles at a time, over TMDB's pages of twenty.
 *
 * Search and the studios once asked for everything a query matched and
 * checked each result's certificate before answering, so a broad word —
 * "disney" — cost two dozen TMDB requests and a long wait for a list nobody
 * scrolls to the end of. Now each request is ten titles, and the next ten are
 * fetched only when you scroll to them.
 *
 * Our page n is one half of TMDB's page ⌈n/2⌉. TMDB's responses are cached,
 * so the second half costs no request at all.
 */
import type { MediaKind } from "@/db/schema";
import type { Hit } from "./queries";
import { posterPath } from "./tmdb";

export const PAGE = 10;
/** TMDB refuses pages past 500. */
const LAST_TMDB_PAGE = 500;

export function pageParam(raw: string | null): number {
  const n = Number(raw ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= LAST_TMDB_PAGE * 2 ? n : 1;
}

export function tmdbPage(page: number) {
  return { tmdbPage: Math.ceil(page / 2), half: (page - 1) % 2 };
}

/**
 * This page's ten, and the page to ask for next — null at the end. A TMDB page
 * with ten titles or fewer (search mixes people in) has no second half, so the
 * next page skips straight to the following TMDB page.
 */
export function slice<T>(titles: T[], page: number, totalPages: number): { items: T[]; next: number | null } {
  const { tmdbPage: tp, half } = tmdbPage(page);
  const items = titles.slice(half * PAGE, half * PAGE + PAGE);
  if (half === 0 && titles.length > PAGE) return { items, next: page + 1 };
  return { items, next: tp < Math.min(totalPages, LAST_TMDB_PAGE) ? tp * 2 + 1 : null };
}

export type TmdbListItem = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
};

export function toHit(r: TmdbListItem, kind: MediaKind): Hit {
  const date = r.release_date ?? r.first_air_date ?? "";
  return {
    tmdbId: r.id,
    kind,
    title: r.title ?? r.name ?? "Untitled",
    year: date.slice(0, 4) ? Number(date.slice(0, 4)) : null,
    poster: posterPath(r.poster_path),
    rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
  };
}
