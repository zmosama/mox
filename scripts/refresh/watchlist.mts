/**
 * Where everything on somebody's watchlist streams now.
 *
 * A film goes on a watchlist while it is still in cinemas, or on a service
 * nobody here pays for, and the moment worth telling you about is the day that
 * changes. Nothing else asks about those titles: the feeds sweep what is new on
 * a service and the calendar sweeps followed series, so a film that reached
 * Netflix six months after release would only be noticed if it happened to
 * come up in a feed. This asks about each one directly, every night, which is
 * what lets the app say "it's on Netflix now".
 */
import { catalogue, db, fetchTitle, mapPool, s, saveTitle, type Fetched } from "./shared.mjs";
import { eq } from "drizzle-orm";

export async function refreshWatchlist(): Promise<string> {
  const wanted = db
    .selectDistinct({ tmdbId: s.verdicts.tmdbId, kind: s.verdicts.kind })
    .from(s.verdicts)
    .where(eq(s.verdicts.verdict, "watchlist"))
    .all();
  if (!wanted.length) return "nothing on any watchlist";

  const services = catalogue();
  const fetched = (await mapPool(wanted, 6, (w) => fetchTitle(w.tmdbId, w.kind, services)))
    .filter((f): f is Fetched => f !== null);

  db.transaction((tx) => {
    for (const title of fetched) saveTitle(tx, title);
  });

  const streaming = fetched.filter((f) => f.platforms.length).length;
  return `${fetched.length} of ${wanted.length} titles checked, ${streaming} streaming`;
}
