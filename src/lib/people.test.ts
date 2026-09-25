/**
 * The people features and "New for you", against a throwaway database.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dir = mkdtempSync(join(tmpdir(), "mox-people-"));
process.env.MOX_DB = join(dir, "test.db");

// Imported after MOX_DB is set: the connection is opened at module load.
let people: typeof import("./people");
let queries: typeof import("./queries");
let avatars: typeof import("./avatars");
let userId: number;

beforeAll(async () => {
  const raw = new Database(process.env.MOX_DB!);
  migrate(drizzle(raw), { migrationsFolder: "./drizzle" });
  userId = Number(
    raw.prepare("insert into users (username, password_hash) values ('viewer', 'x')").run().lastInsertRowid,
  );
  // Two followed shows and one that is not followed.
  raw.prepare("insert into follows (user_id, tmdb_id) values (?, 1), (?, 2)").run(userId, userId);
  const ep = raw.prepare("insert into episodes (show, season, episode, airs, tmdb_id) values (?, ?, ?, ?, ?)");
  ep.run("Alpha", 1, 1, "2026-09-22", 1); // yesterday
  ep.run("Alpha", 1, 2, "2026-09-23", 1); // today
  ep.run("Beta", 2, 5, "2026-09-23", 2); // today
  ep.run("Beta", 2, 4, "2026-09-10", 2); // too old
  ep.run("Gamma", 1, 1, "2026-09-23", 3); // not followed
  raw.close();

  people = await import("./people");
  queries = await import("./queries");
  avatars = await import("./avatars");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("forYou", () => {
  it("offers each followed show at its earliest unwatched episode from the last week", () => {
    const got = queries.forYou(userId, "2026-09-23").map((e) => [e.tmdbId, e.episodeLabel]);
    expect(got).toEqual(
      expect.arrayContaining([
        [1, "S01E01"],
        [2, "S02E05"],
      ]),
    );
    expect(got).toHaveLength(2);
  });

  it("moves on once an episode is ticked, and drops a show when nothing is left", async () => {
    const { db, schema } = await import("@/db");
    db.insert(schema.watchedEpisodes).values({ userId, tmdbId: 1, season: 1, episode: 1 }).run();
    expect(queries.forYou(userId, "2026-09-23").find((e) => e.tmdbId === 1)?.episodeLabel).toBe("S01E02");
    db.insert(schema.watchedEpisodes).values({ userId, tmdbId: 1, season: 1, episode: 2 }).run();
    expect(queries.forYou(userId, "2026-09-23").map((e) => e.tmdbId)).toEqual([2]);
  });
});

describe("following people", () => {
  it("adds, updates in place and removes", () => {
    people.setFollowingPerson(userId, { id: 525, name: "Christopher Nolan", profile: null }, true);
    people.setFollowingPerson(userId, { id: 525, name: "Christopher Nolan", profile: "https://image.tmdb.org/t/p/w185/a.jpg" }, true);
    expect(people.followedPeople(userId)).toEqual([
      { id: 525, name: "Christopher Nolan", profile: "https://image.tmdb.org/t/p/w185/a.jpg", department: null },
    ]);
    people.setFollowingPerson(userId, { id: 525, name: "Christopher Nolan", profile: null }, false);
    expect(people.followedPeople(userId)).toEqual([]);
  });
});

describe("creditsOf", () => {
  const credits = {
    id: 1,
    name: "Someone",
    profile_path: null,
    combined_credits: {
      cast: [
        { id: 10, media_type: "movie" as const, title: "Both", release_date: "2020-01-01", character: "Hero" },
        { id: 11, media_type: "tv" as const, name: "Late Show", first_air_date: "2019-01-01", character: "Guest", genre_ids: [10767] },
        { id: 12, media_type: "movie" as const, title: "Documentary", character: "Himself" },
      ],
      crew: [
        { id: 10, media_type: "movie" as const, title: "Both", release_date: "2020-01-01", job: "Director" },
        { id: 13, media_type: "movie" as const, title: "Friend's Film", job: "Thanks" },
        { id: 14, media_type: "movie" as const, title: "Behind", release_date: "2022-05-05", job: "Writer" },
      ],
    },
  };

  it("is one entry per title with every role, acting winning", async () => {
    const got = people.creditsOf(credits);
    const both = got.find((c) => c.tmdbId === 10)!;
    expect(both.role).toBe("Hero, Director");
    expect(both.as).toBe("acting");
    expect(got.find((c) => c.tmdbId === 14)?.as).toBe("crew");
  });

  it("drops talk shows, appearances as themselves and thanks", async () => {
    const ids = people.creditsOf(credits).map((c) => c.tmdbId);
    expect(ids).not.toContain(11);
    expect(ids).not.toContain(12);
    expect(ids).not.toContain(13);
  });
});

describe("within", () => {
  it("gives the answer when it is quick, and the fallback when it is slow or fails", async () => {
    expect(await people.within(200, Promise.resolve("fast"), "late")).toBe("fast");
    expect(await people.within(20, new Promise((r) => setTimeout(() => r("slow"), 200)), "late")).toBe("late");
    expect(await people.within(200, Promise.reject(new Error("no")), "late")).toBe("late");
  });
});

describe("avatars", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("stores a photo, versions it, and removes it", async () => {
    const saved = await avatars.saveAvatar(userId, png);
    expect(saved.ok).toBe(true);
    expect((await avatars.readAvatar(userId))?.type).toBe("image/png");
    await avatars.removeAvatar(userId);
    expect(await avatars.readAvatar(userId)).toBeNull();
  });

  it("refuses what is not an image, and what is too big", async () => {
    expect((await avatars.saveAvatar(userId, new TextEncoder().encode("<svg/>"))).ok).toBe(false);
    const big = new Uint8Array(avatars.MAX_AVATAR_BYTES + 1);
    big.set(png);
    expect((await avatars.saveAvatar(userId, big)).ok).toBe(false);
  });
});
