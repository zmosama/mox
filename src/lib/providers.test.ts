import { describe, expect, it } from "vitest";
import { includedOn, startedOn, type WatchProviders } from "./providers";

const CATALOGUE = [
  { providerId: 8, name: "Netflix", regions: null },
  { providerId: 337, name: "Disney Plus", regions: ["GB", "US"] },
  { providerId: 119, name: "Amazon Prime Video", regions: null },
];

const providers = (results: WatchProviders) => results;

describe("what a title is included on", () => {
  it("reads the subscription buckets and ignores rent and buy", () => {
    const p = providers({
      EG: {
        flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
        rent: [{ provider_id: 119, provider_name: "Amazon Prime Video" }],
        buy: [{ provider_id: 119, provider_name: "Amazon Prime Video" }],
      },
    });
    expect(includedOn(p, CATALOGUE, "EG")).toEqual(["Netflix"]);
  });

  it("counts free and ad-supported as included", () => {
    const p = providers({
      EG: { ads: [{ provider_id: 119, provider_name: "Amazon Prime Video" }] },
    });
    expect(includedOn(p, CATALOGUE, "EG")).toEqual(["Amazon Prime Video"]);
  });

  it("finds a service that is not sold here in its fallback regions", () => {
    const p = providers({
      GB: { flatrate: [{ provider_id: 337, provider_name: "Disney+" }] },
    });
    expect(includedOn(p, CATALOGUE, "EG")).toEqual(["Disney Plus"]);
  });

  it("reads TOD from its other Arab markets when Egypt's listing has a gap", () => {
    // MobLand's second season: on TOD in Qatar and Morocco, nothing under Egypt.
    const tod = { providerId: 1750, name: "TOD", regions: null };
    const p = providers({ QA: { flatrate: [{ provider_id: 1750, provider_name: "TOD" }] } });
    expect(includedOn(p, [...CATALOGUE, tod], "EG")).toEqual(["TOD"]);
    // A region of its own, set by hand, still wins over the built-in list.
    expect(includedOn(p, [...CATALOGUE, { ...tod, regions: ["GB"] }], "EG")).toEqual([]);
  });

  it("takes a streamer's own show to be on that streamer when TMDB lists nothing here", () => {
    // Blade Runner 2099 on its first day: no country listed at all.
    const prime = [{ id: 1024 }];
    expect(includedOn({}, CATALOGUE, "EG", prime)).toEqual(["Amazon Prime Video"]);
    expect(includedOn(undefined, CATALOGUE, "EG", prime)).toEqual(["Amazon Prime Video"]);
    // Listed abroad and not yet here: still theirs.
    const abroad = providers({ US: { flatrate: [{ provider_id: 119, provider_name: "Amazon Prime Video" }] } });
    expect(includedOn(abroad, CATALOGUE, "EG", prime)).toEqual(["Amazon Prime Video"]);
    // A service the viewer does not have is not offered.
    expect(includedOn({}, [CATALOGUE[0]], "EG", prime)).toEqual([]);
  });

  it("leaves a listing TMDB does give alone, and guesses nothing for a licensed network", () => {
    const hbo = [{ id: 49 }];
    expect(includedOn({}, CATALOGUE, "EG", hbo)).toEqual([]);
    // Listed here on something the viewer lacks: that is the answer, not the network.
    const osn = providers({ EG: { flatrate: [{ provider_id: 629, provider_name: "OSN+" }] } });
    expect(includedOn(osn, CATALOGUE, "EG", [{ id: 213 }])).toEqual([]);
    // Listed here on the viewer's own service: unchanged, no duplicate.
    const here = providers({ EG: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] } });
    expect(includedOn(here, CATALOGUE, "EG", [{ id: 213 }])).toEqual(["Netflix"]);
  });

  it("keeps the catalogue's spelling, not TMDB's, so the logo join still hits", () => {
    const p = providers({
      EG: { flatrate: [{ provider_id: 337, provider_name: "Disney+" }] },
    });
    expect(includedOn(p, CATALOGUE, "EG")).toEqual(["Disney Plus"]);
  });

  it("never lists a service twice when it is in both the region and a fallback", () => {
    const p = providers({
      EG: { flatrate: [{ provider_id: 337, provider_name: "Disney+" }] },
      GB: { flatrate: [{ provider_id: 337, provider_name: "Disney+" }] },
    });
    expect(includedOn(p, CATALOGUE, "EG")).toEqual(["Disney Plus"]);
  });

  it("ignores providers this install does not carry", () => {
    const p = providers({
      EG: { flatrate: [{ provider_id: 999, provider_name: "Somewhere Else" }] },
    });
    expect(includedOn(p, CATALOGUE, "EG")).toEqual([]);
  });

  it("returns nothing rather than throwing when TMDB sends no block at all", () => {
    expect(includedOn(undefined, CATALOGUE, "EG")).toEqual([]);
  });

  it("does not speak for a show that has not started", () => {
    const show = { first_air_date: "2026-11-24", networks: [{ id: 1024 }] };
    expect(startedOn(show, "2026-11-23")).toBeNull();
    expect(startedOn(show, "2026-11-24")).toEqual([{ id: 1024 }]);
    expect(startedOn({ networks: [{ id: 1024 }] }, "2026-11-24")).toBeNull();
  });
});
