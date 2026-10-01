import { describe, expect, it } from "vitest";
import { accepted, findFor, PLAY_RULES, playUrl } from "./play-links";

describe("the Play button", () => {
  // Mohammed's own examples, word for word — these are the ground truth.
  it("sends Shahid term, not q", () => {
    expect(playUrl(1715, "One Piece")).toBe("https://shahid.mbc.net/search?term=One%20Piece");
  });

  it("sends OSN+ query, not q", () => {
    expect(playUrl(629, "Survivor")).toBe("https://osnplus.com/en-eg/search?query=Survivor");
  });

  it("sends STARZPLAY to /en/, not /en-eg/", () => {
    expect(playUrl(630, "Lioness")).toBe("https://starzplay.com/en/search?q=Lioness");
  });

  it("sends Prime Video phrase", () => {
    expect(playUrl(119, "Crime 101")).toBe("https://www.primevideo.com/search?phrase=Crime%20101");
  });

  it("sends TOD q", () => {
    expect(playUrl(1750, "mobland")).toBe("https://www.tod.tv/en/search?q=mobland");
  });

  it("keeps Apple in the Egyptian store", () => {
    expect(playUrl(350, "Severance")).toBe("https://tv.apple.com/eg/search?term=Severance");
  });

  it("sends Netflix q, spaces as %20", () => {
    expect(playUrl(8, "fast and furious")).toBe("https://www.netflix.com/search?q=fast%20and%20furious");
  });

  it("sends Disney+, which has no search URL, through DuckDuckGo to the title page", () => {
    expect(playUrl(337, "Moana 2")).toBe(
      "https://duckduckgo.com/?q=!ducky+site%3Adisneyplus.com+Moana%202",
    );
  });

  it("encodes the title, so a colon or an Arabic name survives", () => {
    expect(playUrl(1715, "Ghostbusters: Frozen Empire")).toBe(
      "https://shahid.mbc.net/search?term=Ghostbusters%3A%20Frozen%20Empire",
    );
    expect(playUrl(1715, "البرنس")).toBe(
      "https://shahid.mbc.net/search?term=%D8%A7%D9%84%D8%A8%D8%B1%D9%86%D8%B3",
    );
  });

  it("prefers a hand-made deep link where there is one", () => {
    expect(playUrl(8, "Dark", "https://www.netflix.com/title/80100172")).toBe(
      "https://www.netflix.com/title/80100172",
    );
  });

  it("gives no link for a service it has no rule for", () => {
    expect(playUrl(999999, "Anything")).toBeNull();
    expect(playUrl(null, "Anything")).toBeNull();
  });

  it("says how every rule was checked", () => {
    for (const rule of Object.values(PLAY_RULES)) expect(rule.verified).toBeTruthy();
  });
});

/* Every landing below is a real one, seen in a browser on 2026-10-01. */
describe("finding the title's own page", () => {
  const land = (id: number, title: string, kind: "movie" | "tv", url: string, year?: number) =>
    accepted(findFor(id, title, kind, year)!, url);

  it("accepts the title page on every service", () => {
    expect(land(8, "Dexter", "tv", "https://www.netflix.com/eg-en/title/70136126"))
      .toBe("https://www.netflix.com/eg-en/title/70136126");
    expect(land(1715, "One Piece", "tv", "https://shahid.mbc.net/en/series/One-Piece-season-1/season-826519-826520"))
      .toBeTruthy();
    expect(land(1750, "MobLand", "tv", "https://www.tod.tv/en/series/english/mobland-5007870")).toBeTruthy();
    expect(land(630, "Lioness", "tv", "https://starzplay.com/en/series/lioness/679056424109")).toBeTruthy();
    expect(land(119, "Reacher", "tv", "https://www.primevideo.com/detail/0RTZ57DQ6PBHH29UN5JS7U7CW4/")).toBeTruthy();
    expect(land(337, "Andor", "tv", "https://www.disneyplus.com/en-eg/browse/entity-faba988a-a9f5-45f2-a074-0775a7d6f67a"))
      .toBeTruthy();
    expect(land(337, "Shōgun", "tv", "https://www.disneyplus.com/en-eg/browse/entity-5422a5f9-e4f1-475e-9217-65e8249388d0"))
      .toBeTruthy();
  });

  it("moves the result into the Egyptian store", () => {
    expect(land(629, "Survivor", "tv", "https://osnplus.com/en-sa/series/survivor-22264"))
      .toBe("https://osnplus.com/en-eg/series/survivor-22264");
    expect(land(350, "Severance", "tv", "https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx"))
      .toBe("https://tv.apple.com/eg/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx");
    expect(land(350, "F1 The Movie", "movie", "https://tv.apple.com/us/movie/f1-the-movie/umc.cmc.3t6dvnnr87zwd4wmvpdx5came"))
      .toBe("https://tv.apple.com/eg/movie/f1-the-movie/umc.cmc.3t6dvnnr87zwd4wmvpdx5came");
  });

  it("rejects the wrong instalment of a film", () => {
    expect(land(630, "John Wick", "movie", "https://starzplay.com/en/movies/john-wick-chapter-4/414478887967", 2014))
      .toBeNull();
    expect(land(630, "John Wick: Chapter 4", "movie", "https://starzplay.com/en/movies/john-wick-chapter-4/414478887967", 2023))
      .toBeTruthy();
  });

  it("rejects a different title that merely shares a word", () => {
    // The series البرنس, landing on the 2020 concert film ليلة البرنس.
    expect(land(1715, "البرنس", "tv",
      "https://shahid.mbc.net/ar/movies/%D9%84%D9%8A%D9%84%D8%A9-%D8%A7%D9%84%D8%A8%D8%B1%D9%86%D8%B3-%D9%85%D8%A7%D8%AC%D8%AF-%D8%A7%D9%84%D9%85%D9%87%D9%86%D8%AF%D8%B3%D8%8C-2020/movie-927254"))
      .toBeNull();
  });

  it("rejects a home page or a list, where the title was not found", () => {
    expect(land(629, "Oppenheimer", "movie", "https://osnplus.com/en-eg", 2023)).toBeNull();
    expect(land(1750, "Gladiator II", "movie", "https://www.tod.tv/en/list/%D8%AD%D8%B5%D8%B1%D9%8A%D8%A7-306123", 2024)).toBeNull();
    expect(land(1715, "One Piece", "tv", "https://shahid.mbc.net/ar")).toBeNull();
  });

  it("rejects a page on some other site", () => {
    expect(land(8, "Dexter", "tv", "https://duckduckgo.com/?q=Dexter")).toBeNull();
    expect(land(8, "Dexter", "tv", "https://netflix.com.evil.example/title/1")).toBeNull();
  });

  it("asks with the year for a film, not for a series", () => {
    expect(findFor(630, "John Wick", "movie", 2014)!.url).toContain("John%20Wick%202014");
    expect(findFor(8, "Dexter", "tv", 2006)!.url).not.toContain("2006");
  });
});
