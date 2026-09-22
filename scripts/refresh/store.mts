/**
 * What has just turned up in the stores, for the evenings something is worth
 * paying for.
 *
 * The feeds ask "what was released", which is the right question for a
 * subscription and the wrong one for a shop. A film reaches a digital store
 * three or four months after cinemas, so Apple's Egyptian store held 6,265
 * films with 168 released inside the year and none inside the month: a
 * release-date feed of it renders empty forever while the shelf behind it
 * changes every week.
 *
 * So this records the shelf and compares it. Every sweep is ids only — six
 * thousand full titles nightly to answer a set difference would be absurd — and
 * the few that turn out to be new are fetched properly afterwards so they have
 * a poster and a score to show.
 */
import { and, eq, isNull, ne, notInArray } from "drizzle-orm";
import { db, fetchTitle, HOME, mapPool, s, saveTitle, subscribed } from "./shared.mjs";
import { applyKnownDates } from "./store-dates.mjs";
import { FOR_SALE, isStore } from "../../src/lib/providers";
import { tmdb } from "../../src/lib/tmdb";

/**
 * A whole storefront is a few hundred pages, so the feeds' ceiling of ten does
 * not apply. TMDB itself stops at 500.
 */
const MAX_PAGES = 400;

/** Before any store was ever swept. Distinguishes a baseline from an arrival. */
const BASELINE = "1970-01-01";

type Page = { results: { id: number }[]; total_pages: number };

async function shelf(providerId: number): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await tmdb<Page>("/discover/movie", {
      watch_region: HOME,
      with_watch_providers: providerId,
      with_watch_monetization_types: FOR_SALE.join("|"),
      page,
    });
    ids.push(...body.results.map((r) => r.id));
    if (page >= body.total_pages) break;
  }
  return ids;
}

export async function refreshStore(today: string) {
  const stores = subscribed().filter((x) => isStore(x.providerId));
  if (!stores.length) return "no stores subscribed to";

  const services = subscribed();
  const summary: string[] = [];

  for (const store of stores) {
    const ids = await shelf(store.providerId);

    /* An empty shelf is an outage, not a closing-down sale. Replacing the
       record with it would mark the entire catalogue as new tomorrow. */
    if (!ids.length) {
      summary.push(`${store.name} came back empty — kept what was there`);
      continue;
    }

    const known = new Set(
      db
        .select({ tmdbId: s.storeItems.tmdbId })
        .from(s.storeItems)
        .where(eq(s.storeItems.providerId, store.providerId))
        .all()
        .map((r) => r.tmdbId),
    );

    /* Nothing recorded yet means this is the baseline, not six thousand
       arrivals. They are backdated so the section stays empty until the shelf
       actually moves — which is the first honest thing it can say. */
    const seeding = known.size === 0;
    const fresh = ids.filter((id) => !known.has(id));

    db.transaction((tx) => {
      for (const tmdbId of fresh) {
        tx.insert(s.storeItems)
          .values({
            providerId: store.providerId,
            tmdbId,
            kind: "movie",
            firstSeen: seeding ? BASELINE : today,
          })
          .onConflictDoNothing()
          .run();
      }

      /* Gone from the shelf, gone from the record — so a film pulled and later
         restocked reads as new again, which from here is exactly what it is. */
      tx.delete(s.storeItems)
        .where(
          and(
            eq(s.storeItems.providerId, store.providerId),
            notInArray(s.storeItems.tmdbId, ids),
          ),
        )
        .run();
    });

    /* The fortnight the baseline could not see. A no-op after the first run. */
    const dated = applyKnownDates(store.providerId, BASELINE);

    /**
     * Details for everything the section could actually print.
     *
     * Asked of the shelf rather than of this run's arrivals. Keying it on
     * `fresh` looked equivalent and left thirteen of the backdated nineteen
     * with no poster, no score and no row on the page, because they had come in
     * with the baseline and no run would ever call them new. A title with a
     * real arrival date and nothing to render is the only thing worth a
     * request, whichever way it got its date — and once fetched it drops out of
     * this query for good.
     */
    const needing = db
      .select({ tmdbId: s.storeItems.tmdbId })
      .from(s.storeItems)
      .leftJoin(
        s.titles,
        and(eq(s.titles.tmdbId, s.storeItems.tmdbId), eq(s.titles.kind, "movie")),
      )
      .where(
        and(
          eq(s.storeItems.providerId, store.providerId),
          ne(s.storeItems.firstSeen, BASELINE),
          isNull(s.titles.tmdbId),
        ),
      )
      .all()
      .map((r) => r.tmdbId);

    if (needing.length) {
      const fetched = (await mapPool(needing, 6, (id) => fetchTitle(id, "movie", services)))
        .filter((f) => f !== null);
      db.transaction((tx) => {
        for (const f of fetched) saveTitle(tx, f);
      });
    }

    summary.push(
      (seeding
        ? `${store.name} baseline of ${ids.length}`
        : `${store.name} ${ids.length} on the shelf, ${fresh.length} new`)
      + (dated ? `, ${dated} backdated from known arrivals` : ""),
    );
  }

  return summary.join("; ");
}
