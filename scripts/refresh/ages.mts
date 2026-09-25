/**
 * Age levels for titles no other step has looked at.
 *
 * Every title a step refreshes brings its certificate along, so this only
 * sweeps what is left — mostly the library rated long ago, which no feed or
 * calendar visits — a few hundred a night until nothing is unchecked. Each is
 * one small request for the certificates alone.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, mapPool, s } from "./shared.mjs";
import { tmdb } from "../../src/lib/tmdb";
import { ageLevel, certAppend, type CertSource } from "../../src/lib/ratings";

const PER_NIGHT = 400;

export async function refreshAges(): Promise<string> {
  const todo = db
    .select({ tmdbId: s.titles.tmdbId, kind: s.titles.kind })
    .from(s.titles)
    .where(isNull(s.titles.ageCheckedAt))
    .limit(PER_NIGHT)
    .all();
  if (!todo.length) return "every title checked";

  const found = await mapPool(todo, 6, async (t) => {
    try {
      const body = await tmdb<CertSource["release_dates"] & CertSource["content_ratings"]>(
        `/${t.kind}/${t.tmdbId}/${certAppend(t.kind)}`,
        {},
      );
      const source: CertSource = t.kind === "movie" ? { release_dates: body } : { content_ratings: body };
      return { ...t, level: ageLevel(t.kind, source) };
    } catch {
      return null;
    }
  });

  const now = Math.floor(Date.now() / 1000);
  let rated = 0;
  db.transaction((tx) => {
    for (const f of found) {
      if (!f) continue;
      if (f.level) rated++;
      tx.update(s.titles)
        .set({ ageLevel: f.level, ageCheckedAt: now })
        .where(and(eq(s.titles.tmdbId, f.tmdbId), eq(s.titles.kind, f.kind)))
        .run();
    }
  });
  const checked = found.filter(Boolean).length;
  return `${checked} of ${todo.length} checked, ${rated} rated, ${checked - rated} unrated`;
}
