/**
 * Who gets the Sports tab. Its Arabic is written by a model on the owner's own
 * account, so it is the owner's alone: absent — not empty — for anyone else.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dir = mkdtempSync(join(tmpdir(), "mox-news-"));
process.env.MOX_DB = join(dir, "test.db");

let news: typeof import("./news");

beforeAll(async () => {
  const seed = new Database(process.env.MOX_DB!);
  migrate(drizzle(seed), { migrationsFolder: "./drizzle" });
  seed.prepare("INSERT INTO users (id, username, password_hash, is_owner) VALUES (1, 'owner', 'x', 1)").run();
  seed.prepare("INSERT INTO users (id, username, password_hash, is_owner) VALUES (2, 'friend', 'x', 0)").run();
  seed.close();
  news = await import("./news");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the Sports tab", () => {
  it("is the owner's", async () => {
    expect(Array.isArray((await news.newsBoard(1, ["en", "ar"])).sports)).toBe(true);
  });

  it("is absent for another account and for a visitor", async () => {
    expect((await news.newsBoard(2, ["en", "ar"])).sports).toBeUndefined();
    expect((await news.newsBoard(null, ["en", "ar"])).sports).toBeUndefined();
    // Absent from what is sent, too: the app draws the tab only when the key is there.
    expect("sports" in JSON.parse(JSON.stringify(await news.newsBoard(2, ["en", "ar"])))).toBe(false);
  });
});
