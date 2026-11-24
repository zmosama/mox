import { describe, expect, it } from "vitest";
import { buildProgress } from "./progress";

const show = { seasons: [{ season_number: 1, episode_count: 2 }] };
const episodes = [
  { episode_number: 1, name: "Hades", air_date: "2026-11-24" },
  { episode_number: 2, name: "Birther of Worlds", air_date: "2026-11-24" },
];
const arrivals = new Map([[1, "2026-11-25"], [2, "2026-11-25"]]);
/** 10:00 Cairo on the 25th. */
const TEN_AM = 1795593600;

describe("buildProgress", () => {
  it("does not call an episode out before its known hour, even on its day", () => {
    const instants = new Map([[1, TEN_AM], [2, TEN_AM]]);
    const p = buildProgress(show, 1, episodes, arrivals, new Set(), "2026-11-25", instants, TEN_AM - 9 * 3600);
    expect(p.aired).toBe(0);
    expect(p.episodes.every((e) => !e.out)).toBe(true);
    expect(p.next).toEqual({ season: 1, episode: 1, airs: "2026-11-25" });
  });

  it("calls it out once the hour has passed", () => {
    const instants = new Map([[1, TEN_AM], [2, TEN_AM]]);
    const p = buildProgress(show, 1, episodes, arrivals, new Set(), "2026-11-25", instants, TEN_AM);
    expect(p.aired).toBe(2);
    expect(p.next).toBeNull();
  });

  it("falls back to the date where no hour is known", () => {
    const p = buildProgress(show, 1, episodes, arrivals, new Set(), "2026-11-25");
    expect(p.aired).toBe(2);
    expect(buildProgress(show, 1, episodes, arrivals, new Set(), "2026-11-24").aired).toBe(0);
  });
});
