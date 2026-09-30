/**
 * Where each service actually plays a title.
 *
 * The Play button used to build a search URL out of `services.search_url` — a
 * hand-written guess per service, patched by throwaway scripts whenever one
 * broke. Most of them were wrong (Shahid wanted `term`, not `q`; Apple TV
 * without a region sent everyone to the American store; Disney+ has no public
 * search route at all and answered 404), and even correct they were the wrong
 * idea: a search page is not what anybody wants from a Play button.
 *
 * TMDB's own watch page carries JustWatch's clickouts, and its URL is built
 * straight from the id we already hold — no slug to resolve, one request per
 * title. Each clickout names a provider and carries its destination, which for
 * a series is often the episode's own player page.
 *
 * `toService` already prefers a deep link over the search URL, so filling these
 * in is the whole change: nothing in the pages needs to know.
 */
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, HOME, mapPool, s } from "./shared.mjs";
import { parseClickouts, type Clickout } from "../../src/lib/justwatch";
import type { MediaKind } from "../../src/db/schema";

/**
 * A night's worth. Raise it for a one-off catch-up.
 */
const PER_RUN = Number(process.env.MOX_LINKS_PER_RUN ?? 150);

/**
 * How long before a title with no offer is asked about again.
 *
 * Measured on the shelf as it stands: of twelve recent titles eight had an
 * offer, against roughly one in fourteen taken at random. The old ones are not
 * slow to answer — they answer "nothing", every night, for ever, and a film
 * released this week queues behind them. A month is long enough to stop that
 * and short enough that a title returning to a service is picked up.
 */
const RETRY_AFTER_DAYS = 30;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

type Target = { tmdbId: number; kind: MediaKind; releaseDate?: string | null };

/**
 * Where this plays, or null if the question could not be asked.
 *
 * The difference is the whole point. An empty array means the page answered and
 * had no offer; null means the fetch failed. Treating those the same is what
 * held the first run to 11% coverage: fetching hundreds of pages at once got
 * throttled, every throttled title was recorded as having no offer, and the row
 * was then left alone for a month — while the page, asked again by hand, had
 * the offer all along.
 */
async function destinations(t: Target): Promise<Clickout[] | null> {
  const url = `https://www.themoviedb.org/${t.kind}/${t.tmdbId}/watch?locale=${HOME}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      return parseClickouts(await res.text());
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

export async function refreshLinks() {
  /* Only what the viewer could actually tap: a title on a service somebody here
     subscribes to, which has no destination recorded yet.

     Newest first, and that ordering matters more than it looks. Without it the
     limit takes an arbitrary slice, so the title somebody is looking at right
     now can sit behind a thousand films from 2011 and wait days for a link
     while the old ones — most of which have no offers at all and never will —
     are retried every single night. */
  const waiting = db
    .selectDistinct({
      tmdbId: s.availability.tmdbId,
      kind: s.availability.kind,
      releaseDate: s.titles.releaseDate,
    })
    .from(s.availability)
    .innerJoin(s.services, eq(s.services.name, s.availability.provider))
    .innerJoin(
      s.titles,
      and(eq(s.titles.tmdbId, s.availability.tmdbId), eq(s.titles.kind, s.availability.kind)),
    )
    .where(
      and(
        isNull(s.availability.deepLink),
        or(
          isNull(s.availability.linkedAt),
          lt(s.availability.linkedAt, Math.floor(Date.now() / 1000) - RETRY_AFTER_DAYS * 86400),
        ),
        inArray(
          s.services.providerId,
          db.selectDistinct({ id: s.userServices.providerId }).from(s.userServices),
        ),
      ),
    )
    .orderBy(desc(s.titles.releaseDate))
    .limit(PER_RUN)
    .all() as Target[];

  if (!waiting.length) return "every title already has its links";

  /* Provider ids come back from JustWatch; `availability` is keyed by name. */
  const nameOf = new Map(
    db
      .select({ providerId: s.services.providerId, name: s.services.name })
      .from(s.services)
      .all()
      .map((r) => [r.providerId, r.name]),
  );

  /* Two at a time, not four. This is somebody else's page and a few hundred
     requests an evening; being throttled costs more than the wait saves. */
  const asked = await mapPool(waiting, 2, async (t) => ({ t, offers: await destinations(t) }));

  let written = 0;
  let titles = 0;
  const now = Math.floor(Date.now() / 1000);

  db.transaction((tx) => {
    /* Only the titles whose page actually answered. One that could not be
       reached is left untouched, so tomorrow tries it again rather than
       writing it off for a month. */
    for (const { t, offers } of asked) {
      if (offers === null) continue;
      tx.update(s.availability)
        .set({ linkedAt: now })
        .where(and(eq(s.availability.tmdbId, t.tmdbId), eq(s.availability.kind, t.kind)))
        .run();
    }

    for (const hit of asked) {
      if (!hit.offers?.length) continue;
      let any = false;
      for (const offer of hit.offers) {
        const provider = nameOf.get(offer.providerId);
        if (!provider) continue;
        const changed = tx
          .update(s.availability)
          .set({ deepLink: offer.url })
          .where(
            and(
              eq(s.availability.tmdbId, hit.t.tmdbId),
              eq(s.availability.kind, hit.t.kind),
              eq(s.availability.provider, provider),
              /* Never overwrite a link that is already there: the store step
                 and the legacy import both wrote some by hand. */
              isNull(s.availability.deepLink),
            ),
          )
          .run().changes;
        if (changed) { written += changed; any = true; }
      }
      if (any) titles++;
    }
  });

  const left = db
    .select({ n: sql<number>`count(*)` })
    .from(s.availability)
    .where(isNull(s.availability.deepLink))
    .get()?.n ?? 0;

  return `${written} links across ${titles} titles, ${left} still unlinked`;
}
