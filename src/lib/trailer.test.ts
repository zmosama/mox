import { afterEach, describe, expect, it, vi } from "vitest";

/* YouTube as the picker sees it: /shorts answers 303 for an ordinary video
   and 200 for a Short or a removed one; oEmbed says 404 for a removed one. */
function youtube(shorts: Set<string>, gone: Set<string>, everythingIsShort = false) {
  vi.stubGlobal("fetch", async (url: string) => {
    const key = /shorts\/([^?]+)|v=([^&]+)/.exec(url)!.slice(1).find(Boolean)!;
    if (url.includes("/shorts/")) return new Response(null, { status: everythingIsShort || shorts.has(key) || gone.has(key) ? 200 : 303 });
    return new Response(null, { status: gone.has(key) ? 404 : 200 });
  });
}

const v = (key: string, type = "Trailer", official = true, name = "Official Trailer") => ({ key, site: "YouTube", type, official, name });

describe("pickTrailer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("skips a vertical Short for the ordinary trailer after it", async () => {
    youtube(new Set(["vert1"]), new Set());
    const { pickTrailer } = await import("./trailer");
    expect((await pickTrailer([v("vert1"), v("wide1")]))?.key).toBe("wide1");
  });

  it("skips one whose name says vertical without asking YouTube", async () => {
    youtube(new Set(), new Set());
    const { pickTrailer } = await import("./trailer");
    expect((await pickTrailer([v("a1", "Trailer", true, "End Times (Vertical)"), v("b1")]))?.key).toBe("b1");
  });

  it("skips a removed video, and offers nothing rather than a dead link", async () => {
    youtube(new Set(), new Set(["dead1"]));
    const { pickTrailer } = await import("./trailer");
    expect(await pickTrailer([v("dead1")])).toBeNull();
  });

  it("prefers official trailers, then any trailer, then teasers", async () => {
    youtube(new Set(), new Set());
    const { pickTrailer } = await import("./trailer");
    expect((await pickTrailer([v("t1", "Teaser"), v("u1", "Trailer", false), v("o1")]))?.key).toBe("o1");
  });

  it("filters nothing if YouTube calls everything a Short", async () => {
    youtube(new Set(), new Set(), true);
    const { pickTrailer } = await import("./trailer");
    expect((await pickTrailer([v("x1"), v("y1")]))?.key).toBe("x1");
  });
});
