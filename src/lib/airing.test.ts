import { describe, expect, it } from "vitest";
import { airsInLocalPrime, arrivalOf, landsOn, landsOnStamp } from "./airing";

describe("when an episode reaches us", () => {
  it("moves an American prime-time broadcast to the next morning", () => {
    // Lanterns S01E06: HBO printed Sunday 20 September, OSN+ at 5:59 on the 21st.
    expect(airsInLocalPrime([{ name: "HBO" }])).toBe(true);
    expect(landsOn("2026-09-20", true)).toBe("2026-09-21");
  });

  it("leaves a global streamer on its printed date", () => {
    // Midnight Pacific is mid-morning here, so the date TMDB prints is ours too.
    for (const name of ["Netflix", "Apple TV+", "Disney+", "Prime Video", "HBO Max"]) {
      expect(airsInLocalPrime([{ name }])).toBe(false);
    }
  });

  it("leaves American streamers alone despite their US origin", () => {
    // TMDB tags both `US`, but they post at midnight Eastern, not at 9pm.
    expect(airsInLocalPrime([{ name: "Hulu" }])).toBe(false);
    expect(airsInLocalPrime([{ name: "Paramount+" }])).toBe(false);
  });

  it("leaves networks east of us alone", () => {
    for (const name of ["BBC One", "Fuji TV", "tvN", "iQiyi", "ONE 31"]) {
      expect(airsInLocalPrime([{ name }])).toBe(false);
    }
  });

  it("shifts when any co-listed network broadcasts in its own prime time", () => {
    expect(airsInLocalPrime([{ name: "Netflix" }, { name: "AMC" }])).toBe(true);
  });

  it("treats an unknown network as needing no shift", () => {
    expect(airsInLocalPrime([{ name: "Some Regional Channel" }])).toBe(false);
    expect(airsInLocalPrime([])).toBe(false);
    expect(airsInLocalPrime(null)).toBe(false);
    expect(airsInLocalPrime([{ name: null }])).toBe(false);
  });

  it("crosses a month boundary", () => {
    expect(landsOn("2026-09-30", true)).toBe("2026-10-01");
    expect(landsOn("2026-09-30", false)).toBe("2026-09-30");
  });
});

describe("arrival read off a real timestamp", () => {
  it("agrees with the network list on the episode that started this", () => {
    // TVmaze: Lanterns S01E06, 21:00 America/New_York on the 20th.
    expect(landsOnStamp("2026-09-21T01:00:00+00:00")).toBe("2026-09-21");
    expect(landsOn("2026-09-20", airsInLocalPrime([{ name: "HBO" }]))).toBe("2026-09-21");
  });

  it("catches the channels the list never knew about", () => {
    // Son of a Critch, CBC 20:30 America/Toronto — CBC is not in the list.
    expect(airsInLocalPrime([{ name: "CBC Television" }])).toBe(false);
    expect(landsOnStamp("2026-09-23T00:30:00+00:00")).toBe("2026-09-23");
  });

  it("keeps an afternoon drop on its own day", () => {
    // Netflix at midnight Pacific is 10:00 here, the same date.
    expect(landsOnStamp("2026-09-25T07:00:00+00:00")).toBe("2026-09-25");
  });

  it("reads the instant, not the text, across a Cairo midnight", () => {
    expect(landsOnStamp("2026-09-20T20:59:00+00:00")).toBe("2026-09-20");
    expect(landsOnStamp("2026-09-20T21:00:00+00:00")).toBe("2026-09-21");
  });

  it("refuses a stamp it cannot read rather than inventing a date", () => {
    expect(landsOnStamp("not a date")).toBeNull();
    expect(landsOnStamp("")).toBeNull();
  });
});

describe("choosing which source to believe", () => {
  const HBO = airsInLocalPrime([{ name: "HBO" }]);

  it("takes the timestamp when it is a day away at most", () => {
    expect(arrivalOf("2026-09-20", "2026-09-21", HBO)).toEqual({
      airs: "2026-09-21", timed: true,
    });
    expect(arrivalOf("2026-09-28", "2026-09-27", false)).toEqual({
      airs: "2026-09-27", timed: true,   // anime: Japan's night is our evening
    });
    expect(arrivalOf("2026-11-03", "2026-11-03", HBO)).toEqual({
      airs: "2026-11-03", timed: true,
    });
  });

  it("refuses a timestamp that is describing a different episode", () => {
    // Big Brother: TMDB's S28E37 is 21 September, TVmaze's is 1 October.
    expect(arrivalOf("2026-09-21", "2026-10-02", false)).toEqual({
      airs: "2026-09-21", timed: false,
    });
  });

  it("falls back to the network list when TVmaze has nothing", () => {
    expect(arrivalOf("2026-09-20", undefined, HBO)).toEqual({
      airs: "2026-09-21", timed: false,
    });
    expect(arrivalOf("2026-09-20", null, false)).toEqual({
      airs: "2026-09-20", timed: false,
    });
  });
});
