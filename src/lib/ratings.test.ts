import { describe, expect, it } from "vitest";
import { ageLevel, allows, filterOff } from "./ratings";

describe("ageLevel", () => {
  it("reads a film's American certificate, theatrical first", () => {
    expect(ageLevel("movie", {
      release_dates: { results: [{ iso_3166_1: "US", release_dates: [
        { certification: "", type: 1 }, { certification: "R", type: 4 }, { certification: "PG-13", type: 3 },
      ] }] },
    })).toBe("13");
  });

  it("falls back to the British certificate, reading 15 as 18+", () => {
    expect(ageLevel("movie", {
      release_dates: { results: [{ iso_3166_1: "GB", release_dates: [{ certification: "15", type: 3 }] }] },
    })).toBe("18");
  });

  it("reads a series' content rating", () => {
    expect(ageLevel("tv", { content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }] } })).toBe("18");
    expect(ageLevel("tv", { content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-Y7" }] } })).toBe("7");
  });

  it("calls a title with no certificate anywhere unrated", () => {
    expect(ageLevel("movie", { release_dates: { results: [{ iso_3166_1: "EG", release_dates: [] }] } })).toBeNull();
    expect(ageLevel("tv", {})).toBeNull();
  });
});

describe("allows", () => {
  it("shows unrated titles unless asked not to", () => {
    expect(allows(["all", "pg"], false, null)).toBe(true);
    expect(allows(["all", "pg"], true, null)).toBe(false);
  });

  it("shows only the chosen levels", () => {
    expect(allows(["all", "pg", "13"], false, "18")).toBe(false);
    expect(allows(["all", "pg", "13"], false, "13")).toBe(true);
  });

  it("knows when the filter is off", () => {
    expect(filterOff(["all", "7", "pg", "13", "18"], false)).toBe(true);
    expect(filterOff(["all", "7", "pg", "13", "18"], true)).toBe(false);
    expect(filterOff(["all", "7", "pg", "13"], false)).toBe(false);
  });
});
