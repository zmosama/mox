/**
 * "Now on Netflix" is only said about a title that was being watched when it
 * got there. Runs the refresh's one writer against a throwaway database.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dir = mkdtempSync(join(tmpdir(), "mox-save-title-"));
process.env.MOX_DB = join(dir, "test.db");

let shared: typeof import("../../scripts/refresh/shared.mjs");

beforeAll(async () => {
  const seed = new Database(process.env.MOX_DB!);
  migrate(drizzle(seed), { migrationsFolder: "./drizzle" });
  seed.close();
  shared = await import("../../scripts/refresh/shared.mjs");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const save = (tmdbId: number, platforms: string[]) =>
  shared.db.transaction((tx) =>
    shared.saveTitle(tx, { tmdbId, kind: "movie", detail: { id: tmdbId, title: `Film ${tmdbId}` } as never, platforms }),
  );

const firstSeen = (tmdbId: number) =>
  Object.fromEntries(
    shared.db.select().from(shared.s.availability).all()
      .filter((a) => a.tmdbId === tmdbId)
      .map((a) => [a.provider, a.firstSeen]),
  );

describe("saveTitle", () => {
  it("does not call a title it has just met an arrival", () => {
    save(1, ["Netflix"]);
    expect(firstSeen(1)).toEqual({ Netflix: 0 });
  });

  it("dates a service that picks up a title already being watched", () => {
    save(2, []);
    save(2, ["Netflix"]);
    expect(firstSeen(2).Netflix).toBeGreaterThan(0);
  });

  it("does not call it an arrival on a title nobody has checked in weeks", () => {
    save(3, []);
    shared.db.update(shared.s.titles).set({ updatedAt: Math.floor(Date.now() / 1000) - 30 * 86400 })
      .where(eq(shared.s.titles.tmdbId, 3)).run();
    save(3, ["Netflix"]);
    expect(firstSeen(3)).toEqual({ Netflix: 0 });
    // Looked at every night since, a second service is news.
    save(3, ["Netflix", "Shahid"]);
    expect(firstSeen(3).Shahid).toBeGreaterThan(0);
  });

  it("keeps the date of a service that is still carrying it, and dates a new one", () => {
    save(1, ["Netflix", "Shahid"]);
    const seen = firstSeen(1);
    expect(seen.Netflix).toBe(0);
    expect(seen.Shahid).toBeGreaterThan(0);
  });
});
