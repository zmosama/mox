import { describe, expect, it } from "vitest";
import { airsInLocalPrime, landsOn, landsOnStamp, needsHistory, seasonArrivals, streamRelease, zonedInstant } from "./airing";
import type { Arrival, ShowSchedule } from "./tvmaze";

describe("when an episode reaches us", () => {
  it("moves an American prime-time broadcast to the next morning", () => {
    // Lanterns S01E06: HBO printed Sunday 20 September, OSN+ at 5:59 on the 21st.
    expect(airsInLocalPrime([{ name: "HBO" }])).toBe(true);
    expect(landsOn("2026-09-20", true)).toBe("2026-09-21");
  });

  it("leaves a global streamer on its printed date", () => {
    // Midnight Pacific is mid-morning here, so the date TMDB prints is ours too.
    for (const name of ["Netflix", "Apple TV+", "Prime Video", "HBO Max"]) {
      expect(airsInLocalPrime([{ name }], ["US"])).toBe(false);
    }
  });

  it("moves a Disney+ American original to the next morning", () => {
    // VisionQuest: printed Tuesday 27 October, out at 6pm Pacific — Wednesday here.
    expect(airsInLocalPrime([{ name: "Disney+" }], ["US"])).toBe(true);
    expect(landsOn("2026-10-27", true)).toBe("2026-10-28");
  });

  it("leaves Disney+ originals made elsewhere on their own date", () => {
    // Korean originals drop in the Seoul afternoon, the same date here.
    expect(airsInLocalPrime([{ name: "Disney+" }], ["KR"])).toBe(false);
    expect(airsInLocalPrime([{ name: "Disney+" }])).toBe(false);
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

describe("networks that share a name", () => {
  it("does not mistake Japan's TBS and CBC for America's and Canada's", () => {
    // Blue Box and LOST10 were moved a day late on the strength of the name.
    expect(airsInLocalPrime([{ name: "TBS", origin_country: "JP" }])).toBe(false);
    expect(airsInLocalPrime([{ name: "MBS", origin_country: "JP" }, { name: "CBC", origin_country: "JP" }])).toBe(false);
    expect(airsInLocalPrime([{ name: "TBS", origin_country: "US" }])).toBe(true);
    expect(airsInLocalPrime([{ name: "CBC", origin_country: "CA" }])).toBe(true);
  });
});

describe("when a streaming service puts an episode up", () => {
  it("reads a time on a US Eastern clock, through the clock change", () => {
    expect(zonedInstant("2026-11-13", "00:00", "America/New_York")).toBe("2026-11-13T05:00:00.000Z");
    expect(zonedInstant("2026-07-03", "00:00", "America/New_York")).toBe("2026-07-03T04:00:00.000Z");
  });

  it("puts Apple TV at the latest reported hour, never the earliest", () => {
    // Reports range from 9pm Eastern the night before to midnight: 7am here.
    expect(streamRelease("Apple TV", "2026-11-13", true)).toBe("2026-11-13T05:00:00.000Z");
  });

  it("puts Netflix at midnight Pacific, ten in the morning here", () => {
    expect(streamRelease("Netflix", "2026-11-26", true)).toBe("2026-11-26T08:00:00.000Z");
  });

  it("puts a Disney+ American original at 6pm Pacific, and the rest earlier", () => {
    expect(streamRelease("Disney+", "2026-11-10", true)).toBe("2026-11-11T02:00:00.000Z");
    expect(streamRelease("Disney+", "2026-11-11", false)).toBe("2026-11-11T08:00:00.000Z");
  });

  it("claims no time for a service whose habit is not known", () => {
    expect(streamRelease("Some Streamer", "2026-11-13", true)).toBeNull();
  });
});

describe("choosing which source to believe", () => {
  const HBO = airsInLocalPrime([{ name: "HBO" }]);
  const timed = (airs: string, stamp = `${airs}T01:00:00+00:00`): Arrival => ({ airs, stamp, web: null });
  const streamed = (airs: string, web: string): Arrival => ({ airs, stamp: null, web });
  const schedule = (entries: [string, Arrival][]): ShowSchedule => new Map(entries);
  const season = (dates: string[]) => dates.map((airDate, i) => ({ key: `1x${i + 1}`, airDate }));

  it("takes the timestamp when it is a day away at most", () => {
    const got = seasonArrivals(
      season(["2026-09-20", "2026-09-28", "2026-11-03"]),
      schedule([["1x1", timed("2026-09-21")], ["1x2", timed("2026-09-27")], ["1x3", timed("2026-11-03")]]),
      HBO, true,
    );
    expect(got.get("1x1")).toEqual({ airs: "2026-09-21", stamp: "2026-09-21T01:00:00+00:00", fromTvmaze: true });
    expect(got.get("1x2")?.airs).toBe("2026-09-27"); // anime: Japan's night is our evening
    expect(got.get("1x3")?.airs).toBe("2026-11-03");
  });

  it("dates 12 12 12 on Apple's Friday, with the moment to announce it", () => {
    // TMDB prints the Thursday; Apple's day is the Friday 13th.
    const got = seasonArrivals(
      season(["2026-11-12", "2026-11-19"]),
      schedule([["1x1", streamed("2026-11-13", "Apple TV")], ["1x2", streamed("2026-11-20", "Apple TV")]]),
      false, true,
    );
    expect(got.get("1x1")).toEqual({ airs: "2026-11-13", stamp: "2026-11-13T05:00:00.000Z", fromTvmaze: true });
    expect(got.get("1x2")?.airs).toBe("2026-11-20");
  });

  it("moves a Disney+ American original once, not twice", () => {
    // VisionQuest: Tuesday in both sources, up here at 4am Wednesday.
    const got = seasonArrivals(season(["2026-11-10"]), schedule([["1x1", streamed("2026-11-10", "Disney+")]]), true, true);
    expect(got.get("1x1")?.airs).toBe("2026-11-11");
  });

  it("dates an unknown service the next morning, without inventing a time", () => {
    const got = seasonArrivals(season(["2026-11-13"]), schedule([["1x1", streamed("2026-11-13", "Some Streamer")]]), false, true);
    expect(got.get("1x1")).toEqual({ airs: "2026-11-14", stamp: null, fromTvmaze: true });
  });

  it("believes a bigger gap when it is the same every week", () => {
    // Dexter: Resurrection streams Fridays; TMDB prints Showtime's Sunday.
    const got = seasonArrivals(
      season(["2026-11-15", "2026-11-22", "2026-11-29"]),
      schedule([
        ["1x1", streamed("2026-11-13", "Paramount+")],
        ["1x2", streamed("2026-11-20", "Paramount+")],
        ["1x3", streamed("2026-11-27", "Paramount+")],
      ]),
      false, true,
    );
    expect([...got.values()].map((a) => a.airs)).toEqual(["2026-11-13", "2026-11-20", "2026-11-27"]);
  });

  it("refuses a gap that wanders, which is two numberings, not two platforms", () => {
    // Big Brother: TMDB's S28E37 is 21 September, TVmaze's is 1 October.
    const got = seasonArrivals(
      season(["2026-09-21", "2026-09-22", "2026-09-24"]),
      schedule([["1x1", timed("2026-10-02")], ["1x2", timed("2026-09-25")], ["1x3", timed("2026-09-24")]]),
      false, true,
    );
    expect(got.get("1x1")).toEqual({ airs: "2026-09-21", stamp: null, fromTvmaze: false });
    expect(got.get("1x2")?.fromTvmaze).toBe(false);
    expect(got.get("1x3")?.fromTvmaze).toBe(true);
  });

  it("does not believe a big gap seen on one episode alone", () => {
    const got = seasonArrivals(season(["2026-11-15"]), schedule([["1x1", streamed("2026-11-13", "Paramount+")]]), false, true);
    expect(got.get("1x1")?.airs).toBe("2026-11-15");
  });

  it("falls back to the network list when TVmaze has nothing", () => {
    expect(seasonArrivals(season(["2026-09-20"]), null, HBO, true).get("1x1"))
      .toEqual({ airs: "2026-09-21", stamp: null, fromTvmaze: false });
    expect(seasonArrivals(season(["2026-09-20"]), schedule([]), false, false).get("1x1")?.airs).toBe("2026-09-20");
  });
});

describe("a season near its end", () => {
  const streamed = (airs: string): Arrival => ({ airs, stamp: null, web: "Paramount+" });
  const finale = [{ key: "2x10", airDate: "2027-01-03" }];

  it("asks for the show's history when one episode's gap cannot be a pattern alone", () => {
    // Dexter's finale, with the nine aired episodes gone from the schedule.
    const future: ShowSchedule = new Map([["2x10", streamed("2027-01-01")]]);
    expect(needsHistory(finale, future, true)).toBe(true);
    expect(seasonArrivals(finale, future, false, true).get("2x10")?.airs).toBe("2027-01-03");
  });

  it("keeps the finale on the streaming day once the aired episodes are in", () => {
    const season = [{ key: "2x8", airDate: "2026-12-20" }, { key: "2x9", airDate: "2026-12-27" }, ...finale];
    const history: ShowSchedule = new Map([
      ["2x8", streamed("2026-12-18")], ["2x9", streamed("2026-12-25")], ["2x10", streamed("2027-01-01")],
    ]);
    expect(seasonArrivals(season, history, false, true).get("2x10")?.airs).toBe("2027-01-01");
  });

  it("does not ask when every gap is a day or less", () => {
    const near: ShowSchedule = new Map([["2x10", streamed("2027-01-03")]]);
    expect(needsHistory(finale, near, true)).toBe(false);
  });
});
