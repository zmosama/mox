/**
 * Rebuild franchise membership from TMDB.
 *
 * `universe_titles` was a fixed list written once by the legacy import, so the
 * MCU ended at whatever had been released that week and nothing announced since
 * has ever appeared. A universe is a query — a keyword, a company, a collection
 * — so it is asked rather than remembered.
 *
 * A universe with none of the three set is left alone: an empty answer would
 * otherwise silently delete a hand-made list.
 */
import { eq } from "drizzle-orm";
import { catalogue, db, mapPool, s, saveTitle, fetchTitle, type Fetched } from "./shared.mjs";
import type { MediaKind } from "../../src/db/schema";
import { tmdb } from "../../src/lib/tmdb";

const MAX_PAGES = 10;

type Listed = { id: number };
type Page = { results: Listed[]; total_pages: number };

type Member = { tmdbId: number; kind: MediaKind };

async function byDiscover(field: string, value: number): Promise<Member[]> {
  const out: Member[] = [];
  for (const kind of ["movie", "tv"] as const) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await tmdb<Page>(`/discover/${kind}`, { [field]: value, page });
      out.push(...body.results.map((r) => ({ tmdbId: r.id, kind })));
      if (page >= body.total_pages) break;
    }
  }
  return out;
}

async function byCollection(id: number): Promise<Member[]> {
  const body = await tmdb<{ parts?: Listed[] }>(`/collection/${id}`, {});
  return (body.parts ?? []).map((p) => ({ tmdbId: p.id, kind: "movie" as const }));
}

export async function refreshUniverses() {
  const defined = db
    .select()
    .from(s.universes)
    .all()
    .filter((u) => u.keyword || u.company || u.collection);

  if (!defined.length) return "no universes define what they are made of";

  const done: string[] = [];
  const failures: string[] = [];
  const services = catalogue();

  for (const universe of defined) {
    let members: Member[];
    try {
      members = universe.collection
        ? await byCollection(universe.collection)
        : universe.keyword
          ? await byDiscover("with_keywords", universe.keyword)
          : await byDiscover("with_companies", universe.company!);
    } catch (e) {
      failures.push(`${universe.slug}: ${(e as Error).message}`);
      continue;
    }

    /* Replacing a list with an empty one is how a franchise page goes blank on
       a bad night. If TMDB answered with nothing, the answer is not believed. */
    if (!members.length) {
      failures.push(`${universe.slug} came back empty — kept the list already there`);
      continue;
    }

    const fetched = (
      await mapPool(members, 6, (m) => fetchTitle(m.tmdbId, m.kind, services))
    ).filter((f): f is Fetched => f !== null);

    db.transaction((tx) => {
      for (const item of fetched) saveTitle(tx, item);
      tx.delete(s.universeTitles).where(eq(s.universeTitles.slug, universe.slug)).run();
      tx.insert(s.universeTitles)
        .values(fetched.map((f) => ({ slug: universe.slug, tmdbId: f.tmdbId, kind: f.kind })))
        .onConflictDoNothing()
        .run();
    });

    done.push(`${universe.slug} ${fetched.length}`);
  }

  const summary = done.join(", ") || "nothing rebuilt";
  if (failures.length) throw new Error(`${summary}; ${failures.join("; ")}`);
  return summary;
}
