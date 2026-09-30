import { describe, expect, it } from "vitest";
import { PLAY_RULES, playUrl } from "./play-links";

describe("the Play button", () => {
  // Mohammed's own examples, word for word — these are the ground truth.
  it("sends Shahid term, not q", () => {
    expect(playUrl(1715, "One Piece")).toBe("https://shahid.mbc.net/search?term=One%20Piece");
  });

  it("sends OSN+ query, not q", () => {
    expect(playUrl(629, "Survivor")).toBe("https://osnplus.com/en-eg/search?query=Survivor");
  });

  it("keeps Apple in the Egyptian store", () => {
    expect(playUrl(350, "Severance")).toBe("https://tv.apple.com/eg/search?term=Severance");
  });

  it("sends Disney+ to its front door rather than a 404", () => {
    expect(playUrl(337, "Andor")).toBe("https://www.disneyplus.com/en-eg");
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
