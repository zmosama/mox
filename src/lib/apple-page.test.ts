import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: {} }));

const { applePageFor, isFilmPage } = await import("./apple-page");

describe("a film's page on Apple's store", () => {
  it("rewrites another country's link for this one and drops the tracking", () => {
    expect(
      applePageFor("https://tv.apple.com/us/movie/the-social-reckoning/umc.cmc.3uu9iew3x8nwhhhukira0m44b?at=1000l3V2", "EG"),
    ).toBe("https://tv.apple.com/eg/movie/the-social-reckoning/umc.cmc.3uu9iew3x8nwhhhukira0m44b");
  });

  it("takes nothing that is not a film's page", () => {
    expect(applePageFor("", "EG")).toBeNull();
    expect(applePageFor("https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx", "EG")).toBeNull();
    expect(applePageFor("https://tv.apple.com/eg/search?term=reckoning", "EG")).toBeNull();
    expect(applePageFor("https://example.com/us/movie/x/umc.cmc.abc", "EG")).toBeNull();
  });

  it("believes a page only when Apple serves the film on it", () => {
    const film = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Movie","name":"The Social Reckoning"}</script>';
    expect(isFilmPage(200, film)).toBe(true);
    expect(isFilmPage(404, film)).toBe(false);
    expect(isFilmPage(301, "")).toBe(false);
    expect(isFilmPage(200, "<html><body>Apple TV</body></html>")).toBe(false);
  });
});
