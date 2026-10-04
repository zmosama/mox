/**
 * IMDb's catalogue, read from data/imdb.db — built on the Mac from IMDb's
 * public datasets by scripts/imdb/build.mts and shipped by scripts/imdb/ship.sh.
 *
 * Read-only, and optional: without the file every function here answers
 * "nothing", so a fresh install or a missing ship never breaks a page. A new
 * file shipped over the old one is noticed within a minute and opened, with
 * no restart.
 *
 * TMDB and IMDb meet on the IMDb id, which MOX's catalogue keeps for every
 * title it has a full record of (see catalog.ts).
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { foldArabic } from "./arabic";

const FILE = process.env.MOX_IMDB_DB ?? join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "imdb.db");

let open: { db: Database.Database; mtime: number } | null = null;
let checkedAt = 0;

/** The database, reopened when a newer file has been shipped; null without one. */
function imdb(): Database.Database | null {
  const now = Date.now();
  if (open && now - checkedAt < 60_000) return open.db;
  checkedAt = now;
  if (!existsSync(FILE)) {
    open?.db.close();
    open = null;
    return null;
  }
  const mtime = statSync(FILE).mtimeMs;
  if (open && open.mtime === mtime) return open.db;
  try {
    const db = new Database(FILE, { readonly: true, fileMustExist: true });
    open?.db.close();
    open = { db, mtime };
  } catch {
    // A file caught mid-copy: keep what was open, and look again next minute.
  }
  return open?.db ?? null;
}

export type ImdbRating = { id: string; rating: number; votes: number };

/** IMDb's rating for these ids, by id. */
export function imdbRatings(ids: (string | null | undefined)[]): Map<string, ImdbRating> {
  const out = new Map<string, ImdbRating>();
  const wanted = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  const db = imdb();
  if (!db || !wanted.length) return out;
  const rows = db
    .prepare(`select tconst, rating, votes from titles where tconst in (${wanted.map(() => "?").join(",")})`)
    .all(...wanted) as { tconst: string; rating: number; votes: number }[];
  for (const r of rows) out.set(r.tconst, { id: r.tconst, rating: r.rating, votes: r.votes });
  return out;
}

export const imdbRating = (id: string | null | undefined) => (id ? (imdbRatings([id]).get(id) ?? null) : null);

export type ImdbTitle = { tconst: string; type: string; title: string; year: number | null; rating: number; votes: number };

/**
 * The most-voted titles IMDb has, skipping ids already settled — for the
 * nightly job that finds each one on TMDB, most important first.
 */
export function topImdbTitles(skip: Set<string>, limit: number): ImdbTitle[] {
  const db = imdb();
  if (!db) return [];
  const out: ImdbTitle[] = [];
  const stmt = db.prepare("select tconst, type, title, year, rating, votes from titles order by votes desc limit ? offset ?");
  // Walk down the list in pages until enough unsettled ones are found.
  for (let offset = 0; out.length < limit; offset += 2000) {
    const page = stmt.all(2000, offset) as ImdbTitle[];
    if (!page.length) break;
    for (const t of page) if (!skip.has(t.tconst) && out.length < limit) out.push(t);
  }
  return out;
}

/**
 * Titles whose name — English, original or Arabic — matches what was typed,
 * most-voted first. Each word is matched as a prefix, so "dark kn" finds The
 * Dark Knight.
 */
export function searchImdb(typed: string, limit = 20): ImdbTitle[] {
  const db = imdb();
  const words = foldArabic(typed.toLowerCase()).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!db || !words.length) return [];
  const query = words.map((w) => `"${w}"*`).join(" ");
  try {
    return db
      .prepare(
        `select t.tconst, t.type, t.title, t.year, t.rating, t.votes
         from titles t join (select distinct tconst from title_search where title_search match ?) m using (tconst)
         order by t.votes desc limit ?`,
      )
      .all(query, limit) as ImdbTitle[];
  } catch {
    return [];
  }
}

export function imdbInfo() {
  const db = imdb();
  if (!db) return null;
  const meta = Object.fromEntries((db.prepare("select key, value from meta").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const n = (db.prepare("select count(*) n from titles").get() as { n: number }).n;
  return { titles: n, builtAt: meta.built_at ?? null };
}
