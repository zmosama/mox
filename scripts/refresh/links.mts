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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, HOME, mapPool, s } from "./shared.mjs";
import { parseClickouts } from "../../src/lib/justwatch";
import type { MediaKind } from "../../src/db/schema";

/**
 * A night's worth. 1,200 titles is a lot of fetching to do at once and the
 * answer barely moves once found, so this fills in over a few nights and then
 * only ever sees what is new. Raise it for a one-off catch-up.
 */
const PER_RUN = Number(process.env.MOX_LINKS_PER_RUN ?? 150);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

type Target = { tmdbId: number; kind: MediaKind };

async function destinations(t: Target) {
  const url = `https://www.themoviedb.org/${t.kind}/${t.tmdbId}/watch?locale=${HOME}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    return parseClickouts(await res.text());
  } catch {
    return null;
  }
}

export async function refreshLinks() {
  /* Only what the viewer could actually tap: a title on a service somebody here
     subscribes to, which has no destination recorded yet. */
  const waiting = db
    .selectDistinct({ tmdbId: s.availability.tmdbId, kind: s.availability.kind })
    .from(s.availability)
    .innerJoin(s.services, eq(s.services.name, s.availability.provider))
    .where(
      and(
        isNull(s.availability.deepLink),
        inArray(
          s.services.providerId,
          db.selectDistinct({ id: s.userServices.providerId }).from(s.userServices),
        ),
      ),
    )
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

  const found = await mapPool(waiting, 4, async (t) => {
    const offers = await destinations(t);
    return offers?.length ? { t, offers } : null;
  });

  let written = 0;
  let titles = 0;

  db.transaction((tx) => {
    for (const hit of found) {
      if (!hit) continue;
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
