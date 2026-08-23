/**
 * TMDB image sizing.
 *
 * Ask for roughly the size the image is drawn at. Requesting w342 for a 26px
 * calendar thumbnail cost megabytes per page load on a phone.
 */
export const POSTER_SIZES = ["w92", "w154", "w185", "w342", "w500"] as const;
export type PosterSize = (typeof POSTER_SIZES)[number];

const BASE = "https://image.tmdb.org/t/p";

/** Accepts either a bare TMDB path or a full URL at some other size. */
export function posterUrl(src: string, size: PosterSize): string {
  if (src.startsWith("http")) return src.replace(/\/w\d+\//, `/${size}/`);
  return `${BASE}/${size}${src.startsWith("/") ? src : `/${src}`}`;
}

export function backdropUrl(src: string, size: "w780" | "w1280" = "w780"): string {
  if (src.startsWith("http")) return src.replace(/\/w\d+\//, `/${size}/`);
  return `${BASE}/${size}${src.startsWith("/") ? src : `/${src}`}`;
}
