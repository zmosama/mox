/**
 * The age filter, applied to any list of titles.
 *
 * Every list a page or the app draws passes through `ageFilter` once, so the
 * rule lives here and nowhere else: a title outside the levels you chose is
 * left out — unless it is something you follow or saved to watch, which stays,
 * marked with its rating as a warning, because hiding a show you follow would
 * be the filter overruling you.
 *
 * With every level allowed (the default) the filter is off: titles still get
 * their label, nothing is dropped.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MediaKind } from "@/db/schema";
import { readPrefs } from "./prefs";
import { AGE_LABEL, ageLevel, allows, certAppend, filterOff, type AgeLevel, type CertSource } from "./ratings";
import { tmdb } from "./tmdb";
import { library } from "./queries";

export type AgeTagged = {
  /** "18+", "PG" … or null when unrated. */
  age: string | null;
  /** Outside the viewer's levels, shown only because they follow or saved it. */
  ageWarn: boolean;
};

type Ref = { tmdbId: number; kind: MediaKind };

const k = (r: Ref) => `${r.tmdbId}:${r.kind}`;

/** Stored levels; `undefined` for titles never checked. */
function storedLevels(refs: Ref[]) {
  const out = new Map<string, AgeLevel | null>();
  for (const kind of ["movie", "tv"] as const) {
    const ids = [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.tmdbId))];
    if (!ids.length) continue;
    for (const row of db
      .select({ tmdbId: schema.titles.tmdbId, level: schema.titles.ageLevel, checked: schema.titles.ageCheckedAt })
      .from(schema.titles)
      .where(and(eq(schema.titles.kind, kind), inArray(schema.titles.tmdbId, ids)))
      .all()) {
      if (row.checked !== null) out.set(`${row.tmdbId}:${kind}`, (row.level as AgeLevel | null) ?? null);
    }
  }
  return out;
}

/** Titles you follow or saved to watch: never hidden, only warned about. */
function exemptions(userId: number | null) {
  const out = new Set<string>();
  if (userId === null) return out;
  for (const f of db.select({ tmdbId: schema.follows.tmdbId }).from(schema.follows).where(eq(schema.follows.userId, userId)).all()) {
    out.add(`${f.tmdbId}:tv`);
  }
  for (const v of db
    .select({ tmdbId: schema.verdicts.tmdbId, kind: schema.verdicts.kind })
    .from(schema.verdicts)
    .where(and(eq(schema.verdicts.userId, userId), eq(schema.verdicts.verdict, "watchlist")))
    .all()) {
    out.add(`${v.tmdbId}:${v.kind}`);
  }
  return out;
}

/**
 * A filter for one viewer. `lookUp` fetches the certificate of titles never
 * checked — for search, whose results come straight from TMDB and may not be
 * stored at all; anything else unchecked counts as unrated until the nightly
 * sweep reaches it.
 */
export function ageFilter(userId: number | null) {
  const prefs = readPrefs(userId);
  const off = filterOff(prefs.ages, prefs.hideUnrated);
  const exempt = off ? new Set<string>() : exemptions(userId);

  return async function apply<T extends Ref>(items: T[], opts: { lookUp?: boolean } = {}): Promise<(T & AgeTagged)[]> {
    const levels = storedLevels(items);
    if (opts.lookUp) {
      const missing = items.filter((i) => !levels.has(k(i))).slice(0, 24);
      await Promise.all(
        missing.map(async (i) => {
          try {
            const body = await tmdb<NonNullable<CertSource["release_dates"]>>(`/${i.kind}/${i.tmdbId}/${certAppend(i.kind)}`, {});
            levels.set(k(i), ageLevel(i.kind, i.kind === "movie" ? { release_dates: body } : { content_ratings: body }));
          } catch {
            // Unknown stays unrated, which is shown unless unrated is hidden.
          }
        }),
      );
    }

    const out: (T & AgeTagged)[] = [];
    for (const item of items) {
      const level = levels.get(k(item)) ?? null;
      const age = level ? AGE_LABEL[level] : null;
      if (off || allows(prefs.ages, prefs.hideUnrated, level)) {
        out.push({ ...item, age, ageWarn: false });
      } else if (exempt.has(k(item))) {
        out.push({ ...item, age: age ?? "Unrated", ageWarn: true });
      }
    }
    return out;
  };
}

type Apply = ReturnType<typeof ageFilter>;

/** Calendar rows, which name a series by id alone and may have none. */
export async function agedEpisodes<T extends { tmdbId: number | null }>(apply: Apply, rows: T[]): Promise<(T & AgeTagged)[]> {
  const tagged = await apply(
    [...new Set(rows.map((r) => r.tmdbId).filter((id): id is number => id !== null))].map((tmdbId) => ({
      tmdbId,
      kind: "tv" as const,
    })),
  );
  const byId = new Map(tagged.map((t) => [t.tmdbId, t]));
  return rows.flatMap((r) => {
    if (r.tmdbId === null) return [{ ...r, age: null, ageWarn: false }];
    const t = byId.get(r.tmdbId);
    return t ? [{ ...r, age: t.age, ageWarn: t.ageWarn }] : [];
  });
}

/** Items that carry their title one level down, like "new from people you follow". */
export async function agedTitles<T extends { title: Ref }>(
  apply: Apply,
  rows: T[],
): Promise<(Omit<T, "title"> & { title: T["title"] & AgeTagged })[]> {
  const kept = new Map((await apply(rows.map((r) => r.title))).map((t) => [k(t), t]));
  return rows.flatMap((row) => {
    const t = kept.get(k(row.title));
    return t ? [{ ...row, title: t }] : [];
  });
}

/** My List: what you follow and saved is never hidden, only labelled. */
export async function agedLibrary(userId: number) {
  const apply = ageFilter(userId);
  const { following, watchlist } = library(userId);
  return { following: await apply(following), watchlist: await apply(watchlist) };
}
