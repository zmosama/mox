/**
 * Arrival dates for a shelf that was recorded blind.
 *
 * The first sweep of a store has nothing to compare itself against, so every
 * title on it is backdated and the section stays empty until something moves.
 * That is the honest default, and it threw away three months of history that
 * was already knowable: JustWatch publishes the day each film reached Apple's
 * Egyptian store, and its timeline goes back to 23 June once the page is
 * scrolled to the end. 133 films were read off it on 21 September 2026 and are
 * listed in `store-arrivals.json`.
 *
 * Each carries JustWatch's own slug, which is what the pricing step needs and
 * cannot derive: there is no TMDB id anywhere on their pages.
 *
 * A one-off, deliberately. Nothing here runs against JustWatch — the list is
 * frozen, and from the second sweep onwards the nightly comparison produces
 * these dates on its own. Applying a date only to rows still at the baseline
 * makes it idempotent: once a date is real, no later run touches it, and a
 * title that leaves and returns is dated by the comparison rather than by this.
 *
 * Every entry was confirmed present on the shelf before being written down, so
 * a name that resolved to a film Apple does not stock was dropped rather than
 * guessed at — 23 of the 153 on the timeline are still undated for that reason,
 * most of them Arabic titles whose slugs are transliterated beyond recognition.
 * Four of those were matched by hand against JustWatch's own page for the film:
 * "Gunche" is the film TMDB calls Colony, and "Moana" is the 2026 live action
 * rather than Moana 2.
 */
import { and, eq, isNull } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db, s } from "./shared.mjs";

/** Apple TV Store, TMDB provider 2. */
const APPLE_TV_STORE = 2;

type Arrival = { tmdbId: number; arrived: string; slug: string };

/* Read rather than inlined: 133 rows of seed data is a table, not code, and
   keeping it out of here leaves the rule above readable. */
const arrivals: Arrival[] = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "store-arrivals.json"),
    "utf8",
  ),
);

const KNOWN: Record<number, Arrival[]> = { [APPLE_TV_STORE]: arrivals };

/**
 * Stamp the known dates onto rows still at `baseline`. Returns how many moved,
 * which is zero on every run after the first.
 */
export function applyKnownDates(providerId: number, baseline: string): number {
  const known = KNOWN[providerId];
  if (!known) return 0;

  let moved = 0;
  db.transaction((tx) => {
    for (const { tmdbId, arrived, slug } of known) {
      const row = and(
        eq(s.storeItems.providerId, providerId),
        eq(s.storeItems.tmdbId, tmdbId),
      );

      moved += tx
        .update(s.storeItems)
        .set({ firstSeen: arrived })
        /* Only ever a baseline row. A date the nightly comparison worked out
           for itself is the better one and is left alone. */
        .where(and(row, eq(s.storeItems.firstSeen, baseline)))
        .run().changes;

      /* The slug is settled separately, because it is true whatever the date
         says. Tying the two together meant the dates landed on one deploy and
         the slugs could never land on the next, the rows having stopped being
         baseline rows in between. */
      tx.update(s.storeItems)
        .set({ jwSlug: slug })
        .where(and(row, isNull(s.storeItems.jwSlug)))
        .run();
    }
  });
  return moved;
}
