/**
 * My List shows what was saved the moment it is saved, including a title no
 * refresh has fetched yet; the phone's alerts wait until its streaming has
 * been checked. Runs against a throwaway database built by the real migrations.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const dir = mkdtempSync(join(tmpdir(), "mox-library-"));
process.env.MOX_DB = join(dir, "test.db");

let queries: typeof import("./queries");
let me = 0;

beforeAll(async () => {
  const seed = new Database(process.env.MOX_DB!);
  seed.pragma("foreign_keys = ON");
  migrate(drizzle(seed), { migrationsFolder: "./drizzle" });
  me = Number(seed.prepare("INSERT INTO users (username, password_hash) VALUES ('sara', 'x')").run().lastInsertRowid);

  // 550 has been through a refresh; 13 and 1399 are only in the catalogue; 999 is nowhere.
  seed.prepare("INSERT INTO titles (tmdb_id, kind, title, year, release_date) VALUES (550, 'movie', 'Fight Club', 1999, '1999-10-15')").run();
  const listed = seed.prepare(
    "INSERT INTO catalog_titles (tmdb_id, kind, title, year, release_date, poster_path, rating) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  listed.run(13, "movie", "Forrest Gump", 1994, "1994-07-06", "/gump.jpg", 8.468);
  listed.run(1399, "tv", "Game of Thrones", 2011, "2011-04-17", null, null);

  const want = seed.prepare("INSERT INTO verdicts (user_id, tmdb_id, kind, verdict, updated_at) VALUES (?, ?, ?, 'watchlist', 1)");
  want.run(me, 550, "movie");
  want.run(me, 13, "movie");
  want.run(me, 999, "movie");
  seed.prepare("INSERT INTO follows (user_id, tmdb_id) VALUES (?, 1399)").run(me);
  seed.close();
  queries = await import("./queries");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("library", () => {
  it("lists a saved title that only the catalogue knows", () => {
    const { watchlist } = queries.library(me);
    expect(watchlist.map((c) => c.title)).toEqual(["Fight Club", "Forrest Gump"]);
    const gump = watchlist[1];
    expect(gump).toMatchObject({ tmdbId: 13, kind: "movie", year: 1994, rating: 8.5, platforms: [] });
    expect(gump.poster).toContain("/gump.jpg");
  });

  it("lists a followed show that only the catalogue knows", () => {
    expect(queries.library(me).following.map((c) => c.title)).toEqual(["Game of Thrones"]);
  });

  it("keeps a title out of the phone's alerts until its streaming has been checked", () => {
    expect(queries.alerts(me).watchlist.map((w) => w.tmdbId)).toEqual([550]);
  });
});
