/**
 * The catalogue's promises: a title met once is kept; a full record is served
 * from here while fresh and TMDB is not asked; an old record beats an error;
 * and a light sighting never erases what the full record said.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dir = mkdtempSync(join(tmpdir(), "mox-catalog-"));
process.env.MOX_DB = join(dir, "test.db");

const tmdb = vi.fn();
vi.mock("./tmdb", () => ({ tmdb: (...args: unknown[]) => tmdb(...args) }));

let catalog: typeof import("./catalog");
let raw: Database.Database;

beforeAll(async () => {
  const seed = new Database(process.env.MOX_DB!);
  migrate(drizzle(seed), { migrationsFolder: "./drizzle" });
  seed.prepare(
    "INSERT INTO titles (tmdb_id, kind, title, year, poster) VALUES (550, 'movie', 'Fight Club', 1999, 'https://image.tmdb.org/t/p/w342/abc.jpg')",
  ).run();
  seed.prepare("INSERT INTO users (username, password_hash) VALUES ('u', 'x')").run();
  seed.prepare("INSERT INTO verdicts (user_id, tmdb_id, kind, verdict) VALUES (1, 77, 'tv', 'love')").run();
  seed.close();
  catalog = await import("./catalog");
  raw = new Database(process.env.MOX_DB!);
});

afterAll(() => {
  raw.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => tmdb.mockReset());

const row = (id: number, kind = "movie") =>
  raw.prepare("SELECT * FROM catalog_titles WHERE tmdb_id = ? AND kind = ?").get(id, kind) as Record<string, unknown> | undefined;

describe("maxAge", () => {
  const today = new Date("2026-10-04");
  it("keeps finished things a month and live things hours", () => {
    expect(catalog.maxAge("tv", "Ended", null, today)).toBe(30 * 86400);
    expect(catalog.maxAge("tv", "Returning Series", null, today)).toBe(6 * 3600);
    expect(catalog.maxAge("movie", null, "1999-10-15", today)).toBe(30 * 86400);
    expect(catalog.maxAge("movie", null, "2026-09-01", today)).toBe(6 * 3600);
    expect(catalog.maxAge("movie", null, "2027-05-01", today)).toBe(6 * 3600);
  });
});

describe("remembering lists", () => {
  it("keeps a title, and a later list without an overview does not erase it", () => {
    catalog.rememberTitles([{ item: { id: 1, title: "Heat", overview: "LA, 1995.", popularity: 40 }, kind: "movie" }]);
    catalog.rememberTitles([{ item: { id: 1, title: "Heat", popularity: 55 }, kind: "movie" }]);
    expect(row(1)).toMatchObject({ title: "Heat", overview: "LA, 1995.", popularity: 55 });
  });
});

describe("titleDetail", () => {
  const detail = {
    id: 2, title: "Alien", status: "Released", release_date: "1979-05-25", imdb_id: "tt0078748",
    genres: [{ id: 1, name: "Horror" }], production_companies: [{ id: 19747, name: "Brandywine" }],
    credits: { cast: Array.from({ length: 60 }, (_, i) => ({ id: i, name: `Actor ${i}` })), crew: [{ job: "Director", name: "Ridley Scott" }, { job: "Grip", name: "Someone" }] },
    videos: { results: [
      ...Array.from({ length: 15 }, (_, i) => ({ site: "YouTube", type: "Featurette", key: `f${i}` })),
      { site: "YouTube", type: "Trailer", key: "t1" },
    ] },
    release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "R", type: 3 }] }] },
  };

  it("asks TMDB once, keeps the record trimmed, then serves it from the catalogue", async () => {
    tmdb.mockResolvedValueOnce(detail);
    const first = await catalog.titleDetail<typeof detail>("movie", 2);
    expect(first.credits.cast).toHaveLength(40);
    expect(first.credits.crew.map((c) => c.job)).toEqual(["Director"]);
    expect(first.videos.results.map((v) => v.key)).toEqual(["t1"]);
    expect(row(2)).toMatchObject({ imdb_id: "tt0078748", status: "Released", companies: "[19747]", genres: '["Horror"]', age_level: "18" });
    // Kept deflated, not as text.
    expect(row(2)?.detail).toBeNull();
    expect((row(2)?.detail_z as Buffer).length).toBeLessThan(JSON.stringify(first).length / 2);

    const again = await catalog.titleDetail<typeof detail>("movie", 2);
    expect(again.title).toBe("Alien");
    expect(tmdb).toHaveBeenCalledTimes(1);
  });

  it("serves the old record when TMDB cannot be reached", async () => {
    raw.prepare("UPDATE catalog_titles SET detail_at = 0 WHERE tmdb_id = 2").run();
    tmdb.mockRejectedValueOnce(new Error("TMDB 503"));
    expect((await catalog.titleDetail<typeof detail>("movie", 2)).title).toBe("Alien");
  });

  it("fails only when there is nothing kept at all", async () => {
    tmdb.mockRejectedValueOnce(new Error("TMDB 503"));
    await expect(catalog.titleDetail("movie", 999)).rejects.toThrow("TMDB 503");
  });
});

describe("packOldDetails", () => {
  it("deflates records written as text, and they still read the same", async () => {
    raw.prepare("INSERT INTO catalog_titles (tmdb_id, kind, title, detail, detail_at) VALUES (8, 'movie', 'Old', ?, unixepoch())")
      .run(JSON.stringify({ title: "Old", tagline: "kept as text" }));
    expect(catalog.packOldDetails()).toBe(1);
    expect(row(8)?.detail).toBeNull();
    expect((await catalog.titleDetail<{ tagline: string }>("movie", 8)).tagline).toBe("kept as text");
    expect(tmdb).not.toHaveBeenCalled();
    expect(catalog.packOldDetails()).toBe(0);
  });
});

describe("age levels", () => {
  it("keeps a certificate looked up, even for a title never seen otherwise", () => {
    catalog.rememberAgeLevel(3, "tv", "13");
    catalog.rememberAgeLevel(4, "tv", null);
    const known = catalog.knownAgeLevels([{ tmdbId: 3, kind: "tv" }, { tmdbId: 4, kind: "tv" }, { tmdbId: 5, kind: "tv" }]);
    expect(known.get("3:tv")).toBe("13");
    expect(known.get("4:tv")).toBeNull();
    expect(known.has("5:tv")).toBe(false);
  });
});

describe("seedCatalog", () => {
  it("takes in the curated titles and everything rated, once", () => {
    expect(catalog.seedCatalog()).toBe(2);
    expect(row(550)).toMatchObject({ title: "Fight Club", poster_path: "/abc.jpg" });
    expect(row(77, "tv")).toBeDefined();
    expect(catalog.seedCatalog()).toBe(0);
  });

  it("fills rated titles in first", async () => {
    tmdb.mockResolvedValue({ name: "x", status: "Ended" });
    const { filled } = await catalog.enrichCatalog(1);
    expect(filled).toBe(1);
    expect(tmdb.mock.calls[0][0]).toBe("/tv/77");
  });
});
