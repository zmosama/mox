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

/**
 * The TMDB sizes we keep our own copy of: the ones the site and the app ask
 * for. Any other size stays a TMDB URL, so it still shows; it just isn't kept.
 */
export const KEPT_SIZES = new Set(["w92", "w154", "w185", "w300", "w342", "w500", "w780", "w1280"]);
export const TMDB_FILE_NAME = /^[A-Za-z0-9_-]{4,80}\.(jpg|png|svg|webp)$/;
const TMDB_FILE = /^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+)\/([^/]+)$/;

/**
 * A TMDB picture as loaded from our own copy (/api/img, see tmdb-images.ts);
 * anything else comes back as it is. Stored URLs stay TMDB's: this is applied
 * where a picture is drawn, so the data keeps one form.
 */
export function localImage<T extends string | null | undefined>(src: T): T {
  if (!src) return src;
  const m = TMDB_FILE.exec(src);
  return (m && KEPT_SIZES.has(m[1]) && TMDB_FILE_NAME.test(m[2]) ? `/api/img/${m[1]}/${m[2]}` : src) as T;
}
