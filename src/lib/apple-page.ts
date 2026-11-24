/**
 * A film's own page on Apple's store in this country, asked of Apple itself.
 *
 * MOX hears what the store sells from TMDB, TMDB from JustWatch, and JustWatch
 * lists Egypt late and a pre-order never: The Social Reckoning was on Apple's
 * Egyptian store for pre-order while all three said it was nowhere. Apple does
 * answer the question directly — a film's public page exists in the countries
 * whose store has it and is a 404 in the ones that do not (the same film was
 * there for /eg/ and /us/ and missing for /jp/).
 *
 * The page needs Apple's own id for the film, which nothing of ours holds.
 * JustWatch does, in its link to Apple wherever it lists the film at all — and
 * it is matched by TMDB id, never by name, so a remake is not taken for it.
 * America has a film on sale before anywhere else, so that is where to ask.
 *
 * What this cannot say: the price, or whether it is a pre-order. Neither is on
 * the public page; both come from an Apple service its robots.txt closes to
 * programs. So the row says the film is listed and opens it, and Apple's own
 * page says the rest.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MediaKind } from "@/db/schema";
import { region } from "./tmdb";
import { askIn } from "./watch-links";

/** Apple TV Store, on TMDB and on JustWatch alike. */
const APPLE_TV_STORE = 2;
/** Where a film is on sale first, then the next most complete catalogue. */
const CATALOGUES = ["US", "GB"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/**
 * Apple's link to a film in one country, rewritten for another.
 *
 * "https://tv.apple.com/us/movie/the-social-reckoning/umc.cmc.3uu9…?at=…" ->
 * "https://tv.apple.com/eg/movie/the-social-reckoning/umc.cmc.3uu9…". Null for
 * anything that is not a film's page: a series, a search, another site.
 */
export function applePageFor(link: string, country: string): string | null {
  const m = /^https:\/\/tv\.apple\.com\/(?:[a-z]{2}\/)?movie\/([^/?#]+)\/(umc\.cmc\.[a-z0-9]+)/.exec(link);
  return m ? `https://tv.apple.com/${country.toLowerCase()}/movie/${m[1]}/${m[2]}` : null;
}

/** Whether what Apple answered is a film's page and not an error or a shell. */
export const isFilmPage = (status: number, html: string) =>
  status === 200 && /application\/ld\+json[^>]*>[^<]*"@type"\s*:\s*"Movie"/.test(html);

export type Found = { url: string | null } | "unknown";

/**
 * Look for the film on Apple's store here. "unknown" when a question could not
 * be asked — which is not the same as Apple not having it, and is not recorded.
 */
export async function findApplePage(tmdbId: number, title: string): Promise<Found> {
  let link: string | null = null;
  let asked = false;
  for (const country of [region(), ...CATALOGUES.filter((c) => c !== region())]) {
    const links = await askIn(country, "movie", tmdbId, title);
    if (!links) continue;
    asked = true;
    link = applePageFor(links.get(APPLE_TV_STORE) ?? "", region());
    if (link) break;
  }
  if (!link) return asked ? { url: null } : "unknown";

  try {
    const res = await fetch(link, {
      headers: { "User-Agent": UA, "Accept-Encoding": "gzip" },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status >= 500 || res.status === 429) return "unknown";
    return { url: isFilmPage(res.status, await res.text()) ? link : null };
  } catch {
    return "unknown";
  }
}

/** The kept page, if one was found. */
export function applePage(tmdbId: number, kind: MediaKind): string | null {
  return db
    .select({ url: schema.applePages.url })
    .from(schema.applePages)
    .where(and(eq(schema.applePages.tmdbId, tmdbId), eq(schema.applePages.kind, kind)))
    .get()?.url ?? null;
}

export function saveApplePage(tmdbId: number, url: string | null) {
  const values = { tmdbId, kind: "movie" as const, url, checkedAt: Math.floor(Date.now() / 1000) };
  db.insert(schema.applePages)
    .values(values)
    .onConflictDoUpdate({ target: [schema.applePages.tmdbId, schema.applePages.kind], set: values })
    .run();
}
