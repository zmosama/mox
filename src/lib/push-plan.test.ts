import { describe, expect, it } from "vitest";
import { cairoInstant, dueEpisodes, dueSessions } from "./push-plan";

describe("cairoInstant", () => {
  it("reads Egypt's summer clock (UTC+3) and its winter one (UTC+2)", () => {
    expect(new Date(cairoInstant("2026-09-25", 600)).toISOString()).toBe("2026-09-25T07:00:00.000Z");
    expect(new Date(cairoInstant("2026-12-25", 600)).toISOString()).toBe("2026-12-25T08:00:00.000Z");
  });
});

describe("dueEpisodes", () => {
  const mobland = { tmdbId: 247718, show: "MobLand", season: 2, episode: 3, airs: "2026-10-02", platforms: ["TOD"] };
  const at10 = cairoInstant("2026-10-02", 600);

  it("is due from the chosen time, for a few hours, and not before", () => {
    expect(dueEpisodes([mobland], 600, at10 - 60_000)).toEqual([]);
    expect(dueEpisodes([mobland], 600, at10 + 60_000)).toEqual([
      {
        key: "ep:247718:2026-10-02",
        title: "MobLand",
        body: "S2 E3 is out — watch it on TOD",
        url: "/title/tv/247718",
        tag: "ep:247718",
      },
    ]);
    expect(dueEpisodes([mobland], 600, at10 + 7 * 3600_000)).toEqual([]);
  });

  it("makes one notification of a season dropped at once", () => {
    const drop = [1, 2, 3].map((episode) => ({ ...mobland, season: 1, episode }));
    expect(dueEpisodes(drop, 600, at10 + 60_000).map((o) => o.body)).toEqual(["S1 E1–E3 are out — watch it on TOD"]);
  });
});

describe("dueSessions", () => {
  const race = { round: 16, race: "Bahrain Grand Prix", kind: "race", label: "Race", at: "2026-10-04T07:00:00.000Z" };
  const start = Date.parse(race.at);

  it("goes off inside the lead time before the start, and only then", () => {
    expect(dueSessions([race], 15, "TOD", start - 20 * 60_000)).toEqual([]);
    expect(dueSessions([race], 15, "TOD", start - 14 * 60_000).map((o) => o.body)).toEqual(["Race in 14 minutes — live on TOD"]);
    expect(dueSessions([race], 15, "TOD", start + 60_000)).toEqual([]);
  });
});
