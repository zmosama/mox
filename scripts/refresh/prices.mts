/**
 * What the films in the store actually cost.
 *
 * TMDB says a film is on Apple's Egyptian store and never what it costs, which
 * is the fact that settles whether it is worth buying tonight. JustWatch prints
 * it, so this reads it: one page for the provider's recent arrivals, then one
 * page per film whose price is missing or stale.
 *
 * Small on purpose. Only films the store section could actually show — a real
 * arrival date, inside the display window — are ever looked up, which is about
 * twenty now and around ten a week after that. Nothing here walks a catalogue.
 *
 * The slug is the awkward part. JustWatch has no TMDB id anywhere on the page,
 * so a film has to be recognised by name, and a wrong match would put the wrong
 * price on a card. Two things keep that honest: the candidate must already be
 * an undated-slug row on our own shelf, and the name is derived from JustWatch's
 * own slug rather than from a translated title. Anything that does not resolve
 * cleanly is left without a slug and simply shows no price.
 */
import { and, eq, gte, isNotNull, isNull, or, lt } from "drizzle-orm";
import { db, s } from "./shared.mjs";
import { addDaysISO } from "../../src/lib/dates";
import { parseArrivals, priceFor } from "../../src/lib/justwatch";
import { STORE_PROVIDERS } from "../../src/lib/providers";
import { tmdb } from "../../src/lib/tmdb";

const BASE = "https://www.justwatch.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/** JustWatch's own path for each store we track. */
const PROVIDER_PATH: Record<number, string> = { 2: "/eg/provider/apple-tv" };

/** How long a price is trusted before it is read again. */
const PRICE_DAYS = 7;

/** How far back the store section looks; nothing older is worth a request. */
const WINDOW_DAYS = 30;

/**
 * A gap between requests.
 *
 * Twenty pages fetched back to back lost one of them — Sliding Doors came back
 * unusable and went unpriced — which is what being impolite to somebody else's
 * site looks like from this end. Twenty requests spread over eight seconds is
 * nothing to a nightly job and is the least this should be doing.
 */
const PAUSE_MS = 400;
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

/**
 * Pinned deliberately.
 *
 * Left to itself Node asks for brotli and zstd too, and for some pages what
 * comes back is a third of the size with the offers missing entirely — a 200,
 * valid HTML, and no prices in it. Sliding Doors failed that way twice while
 * the same URL fetched by hand was complete, which is the sort of difference
 * that reads as "the site is blocking us" and is really a content encoding.
 */
const ACCEPT_ENCODING = "gzip";

async function page(path: string): Promise<string | null> {
  await pause();
  try {
    const res = await fetch(BASE + path, {
      headers: { "User-Agent": UA, "Accept-Encoding": ACCEPT_ENCODING },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * "friday-the-13th-1980" -> { query: "friday the 13th", year: "1980" }.
 *
 * The trailing year is JustWatch disambiguating, so it is the most reliable
 * thing in the slug and is passed to the search rather than dropped. Throwing
 * it away put the 2009 remake and the 1980 original on the same day as if two
 * films had arrived, which is how a helpful-looking cleanup invents data.
 */
function slugQuery(slug: string): { query: string; primary_release_year?: string } {
  const year = /-((?:19|20)\d\d)$/.exec(slug)?.[1];
  const query = slug.replace(/-(19|20)\d\d$/, "").replace(/-/g, " ").trim();
  return year ? { query, primary_release_year: year } : { query };
}

/**
 * Give unslugged rows a slug, where the name resolves to one of them.
 *
 * The search is TMDB's, and the answer only counts if it lands on a film this
 * shelf is already waiting to identify. That constraint is what makes matching
 * by name safe here: the pool is the handful of recent arrivals, not everything
 * ever filmed.
 */
async function attachSlugs(providerId: number, waiting: Set<number>, html: string) {
  let attached = 0;

  for (const { slug } of parseArrivals(html)) {
    if (!waiting.size) break;

    let results: { id: number }[];
    try {
      const body = await tmdb<{ results: { id: number }[] }>("/search/movie", slugQuery(slug));
      results = body.results.slice(0, 5);
    } catch {
      continue;
    }

    const hit = results.find((r) => waiting.has(r.id));
    if (!hit) continue;

    db.update(s.storeItems)
      .set({ jwSlug: slug })
      .where(
        and(
          eq(s.storeItems.providerId, providerId),
          eq(s.storeItems.tmdbId, hit.id),
          eq(s.storeItems.kind, "movie"),
        ),
      )
      .run();
    waiting.delete(hit.id);
    attached++;
  }
  return attached;
}

export async function refreshPrices(today: string) {
  const summary: string[] = [];
  const from = addDaysISO(today, -WINDOW_DAYS);
  const stale = addDaysISO(today, -PRICE_DAYS);

  for (const providerId of STORE_PROVIDERS) {
    const path = PROVIDER_PATH[providerId];
    if (!path) continue;

    /* Rows the section can show: a real arrival date, recent enough to matter. */
    const inWindow = db
      .select({ tmdbId: s.storeItems.tmdbId, slug: s.storeItems.jwSlug })
      .from(s.storeItems)
      .where(
        /* `gte` on the window already excludes the backdated baseline rows,
           which sit decades in the past precisely so they read as "not an
           arrival". */
        and(
          eq(s.storeItems.providerId, providerId),
          gte(s.storeItems.firstSeen, from),
        ),
      )
      .all()
      .filter((r) => r.tmdbId != null);

    if (!inWindow.length) continue;

    const waiting = new Set(inWindow.filter((r) => !r.slug).map((r) => r.tmdbId));
    let attached = 0;

    if (waiting.size) {
      const html = await page(`${path}/new`);
      /* An unreachable page leaves every slug exactly as it was. Nothing here
         is worth failing a refresh over, and a missing price shows as no price
         rather than as a wrong one. */
      if (html) attached = await attachSlugs(providerId, waiting, html);
    }

    const needPrice = db
      .select({ tmdbId: s.storeItems.tmdbId, slug: s.storeItems.jwSlug })
      .from(s.storeItems)
      .where(
        and(
          eq(s.storeItems.providerId, providerId),
          gte(s.storeItems.firstSeen, from),
          isNotNull(s.storeItems.jwSlug),
          or(isNull(s.storeItems.pricedAt), lt(s.storeItems.pricedAt, stale)),
        ),
      )
      .all();

    let priced = 0;
    for (const row of needPrice) {
      const html = await page(`/eg/movie/${row.slug}`);
      if (!html) continue;
      const price = priceFor(html, providerId);
      if (!price) continue;

      db.update(s.storeItems)
        .set({
          rentCent: price.rentCent,
          buyCent: price.buyCent,
          currency: price.currency,
          pricedAt: today,
        })
        .where(
          and(
            eq(s.storeItems.providerId, providerId),
            eq(s.storeItems.tmdbId, row.tmdbId),
            eq(s.storeItems.kind, "movie"),
          ),
        )
        .run();
      priced++;
    }

    summary.push(
      `${inWindow.length} in window, ${attached} newly identified, ${priced} priced`,
    );
  }

  return summary.join("; ") || "no stores to price";
}
