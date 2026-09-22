import { describe, expect, it } from "vitest";
import { episodeKey, indexSchedule, type ScheduleEntry } from "./tvmaze";

const entry = (over: Partial<ScheduleEntry> & { imdb?: string; tvdb?: number }): ScheduleEntry => ({
  season: 1,
  number: 6,
  airtime: "21:00",
  airstamp: "2026-09-21T01:00:00+00:00",
  _embedded: { show: { externals: { imdb: over.imdb ?? "tt111", thetvdb: over.tvdb ?? 222 } } },
  ...over,
});

describe("indexing TVmaze's schedule", () => {
  it("dates an episode by the instant it airs", () => {
    // Lanterns: HBO 21:00 New York on the 20th is the 21st in Cairo.
    const s = indexSchedule([entry({})]);
    expect(s.dated).toBe(1);
    expect(s.forShow("tt111", null)?.get(episodeKey(1, 6))).toBe("2026-09-21");
  });

  it("finds the same show by either id", () => {
    const s = indexSchedule([entry({})]);
    expect(s.forShow(null, 222)?.get("1x6")).toBe("2026-09-21");
    expect(s.forShow("tt111", null)?.get("1x6")).toBe("2026-09-21");
  });

  it("drops an episode with no air time rather than trusting the placeholder", () => {
    /* The stamp is still there when the time is blank, but it is a 04:00 UTC
       stand-in for "unknown". Believing it would put every evening broadcast
       back on the wrong day, which is the bug this exists to prevent. */
    const s = indexSchedule([
      entry({ airtime: null, airstamp: "2026-09-20T04:00:00+00:00" }),
      entry({ airtime: "", airstamp: "2026-09-20T05:00:00+00:00" }),
    ]);
    expect(s.dated).toBe(0);
    expect(s.forShow("tt111", null)).toBeNull();
  });

  it("ignores an entry with nothing to match it on", () => {
    const s = indexSchedule([{ ...entry({}), _embedded: { show: { externals: null } } }]);
    expect(s.dated).toBe(0);
  });

  it("skips an unparseable stamp instead of inventing a date", () => {
    expect(indexSchedule([entry({ airstamp: "soon" })]).dated).toBe(0);
  });

  it("returns null for a show it has never heard of, so the caller falls back", () => {
    const s = indexSchedule([entry({})]);
    expect(s.forShow("tt999", 999)).toBeNull();
    expect(s.forShow(null, null)).toBeNull();
  });

  it("keeps each show's episodes apart", () => {
    const s = indexSchedule([
      entry({ imdb: "tt1", tvdb: 1, number: 6 }),
      entry({ imdb: "tt2", tvdb: 2, number: 3, airstamp: "2026-10-01T02:00:00+00:00" }),
    ]);
    expect(s.forShow("tt1", null)?.get("1x6")).toBe("2026-09-21");
    expect(s.forShow("tt2", null)?.get("1x3")).toBe("2026-10-01");
    expect(s.forShow("tt1", null)?.has("1x3")).toBe(false);
  });
});
