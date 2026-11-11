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
/**
 * Sizes TMDB does not have, which we make ourselves from its original: the
 * big picture across the top of Home. TMDB jumps from 1280 wide straight to
 * the original (up to 3840 wide and well over a megabyte), and 1280 stretched
 * over a sharp screen's two thousand pixels is soft. These sit in between —
 * wide enough to be sharp, a fraction of the original's bytes.
 */
export const MADE_SIZES: Record<string, number> = { w1920: 1920, w2560: 2560 };

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
  if (!m || !TMDB_FILE_NAME.test(m[2])) return src;
  // A size we make exists only as our WebP of a photo.
  if (m[1] in MADE_SIZES) return (m[2].endsWith(".jpg") ? `/api/img/${m[1]}/${m[2].replace(/\.jpg$/, ".webp")}` : src) as T;
  if (!KEPT_SIZES.has(m[1])) return src;
  // Photos as WebP, about half the bytes (tmdbWebp). PNG and SVG logos are small and stay themselves.
  return `/api/img/${m[1]}/${m[2].replace(/\.jpg$/, ".webp")}` as T;
}
