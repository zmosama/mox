/**
 * Friendship is mutual by construction: adding from one side shows each to
 * the other, and removing from either side removes both. Runs against a
 * throwaway database built by the real migrations.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// auth.ts reads the request's cookies; nothing here needs a request.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const dir = mkdtempSync(join(tmpdir(), "mox-friends-"));
process.env.MOX_DB = join(dir, "test.db");

let friends: typeof import("./friends");
const ids: Record<string, number> = {};

beforeAll(async () => {
  const seed = new Database(process.env.MOX_DB!);
  seed.pragma("foreign_keys = ON");
  migrate(drizzle(seed), { migrationsFolder: "./drizzle" });
  for (const [name, email] of [["sara", "sara@example.com"], ["omar", null], ["nour", null]]) {
    ids[name!] = Number(
      seed.prepare("INSERT INTO users (username, password_hash, email) VALUES (?, 'x', ?)").run(name, email).lastInsertRowid,
    );
  }
  const rate = seed.prepare("INSERT INTO verdicts (user_id, tmdb_id, kind, verdict, updated_at) VALUES (?, ?, ?, ?, ?)");
  rate.run(ids.sara, 550, "movie", "love", 100);
  rate.run(ids.nour, 550, "movie", "dislike", 200);
  rate.run(ids.sara, 1399, "tv", "watchlist", 300);
  seed.close();
  friends = await import("./friends");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("friends", () => {
  it("adds by username or email, both ways", () => {
    expect(friends.addFriend(ids.omar, "Sara@Example.com").ok).toBe(true);
    expect(friends.friendsOf(ids.omar).map((f) => f.username)).toEqual(["sara"]);
    expect(friends.friendsOf(ids.sara).map((f) => f.username)).toEqual(["omar"]);
    expect(friends.addFriend(ids.omar, "@sara").ok).toBe(true); // again: no duplicate
    expect(friends.friendsOf(ids.omar)).toHaveLength(1);
  });

  it("refuses yourself and strangers", () => {
    expect(friends.addFriend(ids.omar, "omar")).toMatchObject({ ok: false });
    expect(friends.addFriend(ids.omar, "nobody")).toMatchObject({ ok: false, status: 404 });
  });

  it("shows only friends' verdicts, matched by kind", () => {
    const marks = friends.friendMarks(ids.omar, [{ tmdbId: 550, kind: "movie" }, { tmdbId: 1399, kind: "movie" }]);
    expect(marks.get("550:movie")?.map((m) => [m.name, m.verdict])).toEqual([["sara", "love"]]);
    expect(marks.has("1399:movie")).toBe(false);
  });

  it("lists friends' activity newest first, by friend and verdict", () => {
    friends.addFriend(ids.omar, "nour");
    expect(friends.friendActivity(ids.omar, { page: 1 }).rows.map((r) => r.tmdbId)).toEqual([1399, 550, 550]);
    expect(friends.friendActivity(ids.omar, { page: 1, friendId: ids.nour }).rows.map((r) => r.friend.verdict)).toEqual(["dislike"]);
    expect(friends.friendActivity(ids.omar, { page: 1, verdict: "love" }).rows).toHaveLength(1);
    // Not a friend of omar's: asking for them shows nothing rather than their list.
    expect(friends.friendActivity(ids.sara, { page: 1, friendId: ids.nour }).rows).toEqual([]);
  });

  it("suggests people from a letter, without you or your friends", () => {
    // omar's friends at this point: sara and nour — nobody left to suggest.
    expect(friends.findPeople(ids.omar, "a")).toEqual([]);
    expect(friends.findPeople(ids.sara, "n").map((f) => f.username)).toEqual(["nour"]);
    expect(friends.findPeople(ids.sara, "%")).toEqual([]);
    expect(friends.findPeople(ids.sara, " ")).toEqual([]);
  });

  it("removes both ways", () => {
    friends.removeFriend(ids.sara, ids.omar);
    expect(friends.friendsOf(ids.omar).map((f) => f.username)).toEqual(["nour"]);
    expect(friends.friendsOf(ids.sara)).toEqual([]);
  });
});
