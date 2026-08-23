import { describe, expect, it } from "vitest";
import { LIMIT, selectFeed, windowFor, type Candidate } from "./feeds";

const TODAY = "2026-08-23";

const at = (tmdbId: number, date: string | null, popularity = 1): Candidate => ({
  tmdbId,
  kind: "movie",
  date,
  popularity,
});

describe("feed membership", () => {
  it("keeps new releases inside the window, newest first", () => {
    const picked = selectFeed(
      "new",
      [at(1, "2026-07-01"), at(2, "2026-08-20"), at(3, "2026-08-10")],
      TODAY,
    );
    expect(picked.map((p) => p.tmdbId)).toEqual([2, 3, 1]);
  });

  it("drops anything older than the window or dated in the future", () => {
    const picked = selectFeed("new", [at(1, "2026-01-01"), at(2, "2026-09-01")], TODAY);
    expect(picked).toEqual([]);
  });

  it("counts today itself as new", () => {
    expect(selectFeed("new", [at(1, TODAY)], TODAY).map((p) => p.tmdbId)).toEqual([1]);
  });

  it("orders coming soon by how close it is, not how new", () => {
    const picked = selectFeed(
      "upcoming",
      [at(1, "2026-10-01"), at(2, "2026-08-26"), at(3, "2026-09-05")],
      TODAY,
    );
    expect(picked.map((p) => p.tmdbId)).toEqual([2, 3, 1]);
  });

  it("excludes today from coming soon — it is already out", () => {
    expect(selectFeed("upcoming", [at(1, TODAY)], TODAY)).toEqual([]);
  });

  it("breaks a shared date on popularity", () => {
    const picked = selectFeed("new", [at(1, "2026-08-20", 5), at(2, "2026-08-20", 90)], TODAY);
    expect(picked.map((p) => p.tmdbId)).toEqual([2, 1]);
  });

  it("drops undated titles, which have nowhere to sit on a timeline", () => {
    expect(selectFeed("new", [at(1, null), at(1, "")], TODAY)).toEqual([]);
  });

  it("keeps the first sighting when the same title arrives from two sweeps", () => {
    const picked = selectFeed("new", [at(7, "2026-08-20"), at(7, "2026-08-20")], TODAY);
    expect(picked).toHaveLength(1);
  });

  it("treats a film and a series sharing a TMDB id as two titles", () => {
    const picked = selectFeed(
      "new",
      [at(7, "2026-08-20"), { ...at(7, "2026-08-20"), kind: "tv" }],
      TODAY,
    );
    expect(picked).toHaveLength(2);
  });

  it("leaves trending in TMDB's own order and caps it", () => {
    const many = Array.from({ length: 80 }, (_, i) => at(i, null));
    expect(selectFeed("trending", many, TODAY)).toHaveLength(LIMIT.trending);
  });

  it("asks TMDB for exactly the window it will then filter on", () => {
    expect(windowFor("new", TODAY)).toEqual({ from: "2026-06-24", to: TODAY });
    expect(windowFor("upcoming", TODAY)).toEqual({ from: "2026-08-24", to: "2026-11-21" });
  });
});
