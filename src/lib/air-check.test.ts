import { describe, expect, it } from "vitest";
import { airKey, compare, foldShow, inUtc, isAlarm, judge, parseDay, parseMonth, plainSummary, theirsOf, type Aired, type Mine } from "./air-check";

const MONTH = `
<select name="timezone"><option value="US/Pacific" >US Pacific</option><option value="GMT" style=" color: #000" selected="selected">UTC</option></select>
<div class="noday"></div>
<div id="d_19_11_2026" class="day">
<strong><a href="./day/19-11-2026">19th</a></strong>
<div class="ep info"><span class="">
  <p data-episode="q/1"><a href="Chicago-Med-summary" >Chicago Med</a>
     <a href="Chicago-Med/Season-12/Episode-7" style="font-size: 0.65rem;">s12e07</a></p></span></div>
<div class="ep info"><span class="">
  <p data-episode="q/2"><a href="Wheres-Wanda-summary" >Where&#039;s Wanda?</a>
     <a href="Wheres-Wanda/Season-2/Episode-5">s02e05</a></p></span></div>
</div>
<div id="d_20_11_2026" class="day">
<div class="ep info"><span class="">
  <p data-episode="q/3"><a href="Law-and-Order-summary" >Law &amp; Order</a>
     <a href="Law-and-Order/Season-26/Episode-8">s26e08</a></p></span></div>
</div>`;

const DAY = `
<option value="GMT" selected="selected">UTC</option>
<div class="overbox " >
  <h4><a href="/cat/Chicago-Med-summary">Chicago Med</a> <span>Season 12, Episode 7</span></h4>
  <div class="showepname"><h5><a href="/cat/Chicago-Med/Season-12/Episode-7">Borders</a></h5>
  <p><strong>Airs:</strong> 1:00am - 2:00am on NBC</p></div>
  <div class="summ">A summary.</div>
</div>
<div class="overbox " >
  <h4><a href="/cat/Wheres-Wanda-summary">Where&#039;s Wanda?</a> <span>Season 2, Episode 5</span></h4>
  <div class="showepname"><h5><a href="/cat/Wheres-Wanda/Season-2/Episode-5">Five</a></h5>
  <p><strong>Airs:</strong> 4:59am - 5:59am on Apple TV+</p></div>
  <div class="summ">Another.</div>
</div>
<div class="overbox " >
  <h4><a href="/cat/Cunk-on-Cinema-summary">Cunk on Cinema</a> <span>Season 1, Episode 2</span></h4>
  <div class="showepname"><p><strong>Airs:</strong> 10:00pm - 11:00pm on BBC Two</p></div>
  <div class="summ">Third.</div>
</div>
<div class="overbox " >
  <h4><a href="/cat/No-Time-summary">No Time</a> <span>Season 3, Episode 1</span></h4>
  <div class="summ">Nothing said about when.</div>
</div>`;

describe("reading pogdesign", () => {
  it("knows a page served in UTC from one that is not", () => {
    expect(inUtc(MONTH)).toBe(true);
    expect(inUtc(MONTH.replace('value="GMT" style=" color: #000" selected="selected"', 'value="GMT"').replace('value="US/Pacific" ', 'value="US/Pacific" selected="selected"'))).toBe(false);
    expect(inUtc("<html>changed</html>")).toBe(false);
  });

  it("reads a month: each episode under its day, names as written", () => {
    expect(parseMonth(MONTH)).toEqual([
      { slug: "Chicago-Med", show: "Chicago Med", season: 12, episode: 7, day: "2026-11-19" },
      { slug: "Wheres-Wanda", show: "Where's Wanda?", season: 2, episode: 5, day: "2026-11-19" },
      { slug: "Law-and-Order", show: "Law & Order", season: 26, episode: 8, day: "2026-11-20" },
    ]);
  });

  it("reads a day: the start as an instant, the network, and an entry with no time at all", () => {
    const [med, wanda, cunk, none] = parseDay(DAY, "2026-11-19");
    expect(med).toMatchObject({ slug: "Chicago-Med", season: 12, episode: 7, at: "2026-11-19T01:00:00.000Z", network: "NBC" });
    expect(wanda).toMatchObject({ show: "Where's Wanda?", at: "2026-11-19T04:59:00.000Z", network: "Apple TV+" });
    expect(cunk.at).toBe("2026-11-19T22:00:00.000Z");
    expect(none).toMatchObject({ slug: "No-Time", at: null, network: null });
  });

  it("finds nothing, rather than something wrong, on a page it does not recognise", () => {
    expect(parseMonth("<html><body>redesigned</body></html>")).toEqual([]);
    expect(parseDay("<html><body>redesigned</body></html>", "2026-11-19")).toEqual([]);
  });
});

const aired = (over: Partial<Aired>): Aired => ({ slug: "S", show: "S", season: 1, episode: 1, day: "2026-11-19", at: null, network: null, ...over });
const mine = (over: Partial<Mine>): Mine => ({ tmdbId: 1, show: "S", season: 1, episode: 1, airs: "2026-11-19", airsAt: null, ...over });

describe("what pogdesign is really saying", () => {
  it("a broadcast is its instant, on the Cairo date", () => {
    // NBC, 8pm Eastern on the 18th: 3am on the 19th in Cairo.
    expect(theirsOf(aired({ at: "2026-11-19T01:00:00.000Z", network: "NBC" }))).toEqual({ kind: "timed", at: "2026-11-19T01:00:00.000Z", lands: "2026-11-19" });
    // BBC Two, 10pm in London: midnight in Cairo, so the next date.
    expect(theirsOf(aired({ at: "2026-11-19T22:00:00.000Z", network: "BBC Two" }))).toMatchObject({ kind: "timed", lands: "2026-11-20" });
  });

  it("11:59pm Eastern is a placeholder for a day, whoever airs it", () => {
    expect(theirsOf(aired({ at: "2026-11-19T04:59:00.000Z", network: "Netflix" }))).toEqual({ kind: "day", officialDay: "2026-11-18" });
    expect(theirsOf(aired({ at: "2026-11-19T04:59:00.000Z", network: "FOX" }))).toEqual({ kind: "day", officialDay: "2026-11-18" });
  });

  it("the placeholder is found by the Eastern clock, so it survives summer time", () => {
    // In July 11:59pm Eastern is 3:59am UTC, not 4:59.
    expect(theirsOf(aired({ day: "2026-07-10", at: "2026-07-10T03:59:00.000Z", network: "Hulu" }))).toEqual({ kind: "day", officialDay: "2026-07-09" });
    expect(theirsOf(aired({ day: "2026-07-10", at: "2026-07-10T04:59:00.000Z", network: "ABC" }))).toMatchObject({ kind: "timed" });
  });

  it("a streaming service at 11pm or later is a placeholder too; a broadcaster at 11pm is a real show", () => {
    expect(theirsOf(aired({ at: "2026-11-19T04:00:00.000Z", network: "Amazon Prime Video" }))).toEqual({ kind: "day", officialDay: "2026-11-18" });
    expect(theirsOf(aired({ at: "2026-11-19T04:00:00.000Z", network: "Comedy Central" }))).toMatchObject({ kind: "timed", lands: "2026-11-19" });
    // Peacock at 9pm Eastern is a simulcast with a real hour.
    expect(theirsOf(aired({ at: "2026-11-19T02:00:00.000Z", network: "Peacock" }))).toMatchObject({ kind: "timed" });
  });

  it("no time on the page leaves only the page's day", () => {
    expect(theirsOf(aired({ at: null }))).toEqual({ kind: "day", officialDay: "2026-11-19" });
  });
});

describe("one episode against pogdesign", () => {
  const nbc = aired({ at: "2026-11-19T01:00:00.000Z", network: "NBC" });

  it("agrees when the broadcast lands on the day MOX says", () => {
    expect(judge(mine({ airs: "2026-11-19" }), nbc)).toBeNull();
  });

  it("MOX a day before the broadcast lands is the alarm", () => {
    const f = judge(mine({ airs: "2026-11-18" }), nbc)!;
    expect(f.kind).toBe("early");
    expect(f.theirs).toBe("2026-11-19");
    expect(isAlarm(f)).toBe(true);
  });

  it("MOX after it lands is only late", () => {
    const f = judge(mine({ airs: "2026-11-20" }), nbc)!;
    expect(f.kind).toBe("late");
    expect(isAlarm(f)).toBe(false);
  });

  it("the right day with a notification well before it airs is flagged; a few minutes before is not", () => {
    const at = Date.parse("2026-11-19T01:00:00Z") / 1000;
    expect(judge(mine({ airsAt: at - 3 * 3600 }), nbc)?.kind).toBe("early_notice");
    expect(judge(mine({ airsAt: at - 20 * 60 }), nbc)).toBeNull();
    expect(judge(mine({ airsAt: at + 3600 }), nbc)).toBeNull();
  });

  /* The case that makes or breaks the report: Apple TV+, official day the
     18th, printed by pogdesign as 11:59pm Eastern — 6:59am on the 19th in
     Cairo. MOX dates it by Apple's own release hour, the 18th. Read as a real
     time that is "a day early", every week, for every streaming show. */
  const apple = aired({ at: "2026-11-19T04:59:00.000Z", network: "Apple TV+" });

  it("a streaming release on its official day is not early, though pogdesign's placeholder is the next morning", () => {
    expect(judge(mine({ airs: "2026-11-18" }), apple)).toBeNull();
    expect(judge(mine({ airs: "2026-11-19" }), apple)).toBeNull();
  });

  it("a streaming release dated before its official day is early", () => {
    const f = judge(mine({ airs: "2026-11-17" }), apple)!;
    expect(f.kind).toBe("early");
    expect(f.theirs).toBe("2026-11-18");
    expect(f.theirsAt).toBeNull();
  });

  it("two days after the official day is late", () => {
    expect(judge(mine({ airs: "2026-11-20" }), apple)?.kind).toBe("late");
  });
});

describe("the whole comparison", () => {
  const listed = parseMonth(MONTH);
  const pages = new Map(parseDay(DAY, "2026-11-19").map((e) => [airKey(e.slug, e.season, e.episode), e]));
  const window = { from: "2026-11-18", to: "2026-11-25" };
  const med = mine({ tmdbId: 10, show: "Chicago Med", season: 12, episode: 7, airs: "2026-11-19" });

  it("counts what matches and reports nothing about it", () => {
    const c = compare([med], new Map([[10, new Map([["12x7", "2026-11-19"]])]]), new Map([[10, "Chicago-Med"]]), listed, pages, window);
    expect(c).toEqual({ findings: [], agreed: 1, checked: 1 });
  });

  it("a show pogdesign does not carry is unverified, never an alarm", () => {
    const c = compare([mine({ tmdbId: 99, show: "الهيبة" })], new Map(), new Map(), listed, pages, window);
    expect(c.findings.map((f) => f.kind)).toEqual(["unverified"]);
    expect(c.findings.some(isAlarm)).toBe(false);
    expect(c.checked).toBe(0);
  });

  it("far from pogdesign's month page, with no day page to read, is still a difference; a day apart is not", () => {
    const law = (airs: string) => [mine({ tmdbId: 20, show: "Law & Order", season: 26, episode: 8, airs })];
    const run = (airs: string) => compare(law(airs), new Map(), new Map([[20, "Law-and-Order"]]), listed, pages, window).findings[0];
    // The month page has it on the 20th, and no day page for the 20th was read.
    expect(run("2026-11-18")).toMatchObject({ kind: "early", theirs: "2026-11-20" });
    expect(run("2026-11-23")).toMatchObject({ kind: "late", theirs: "2026-11-20" });
    expect(run("2026-11-19").kind).toBe("unverified");
    expect(run("2026-11-21").kind).toBe("unverified");
  });

  it("pogdesign counting a season one ahead is not MOX being late or early", () => {
    // MOX: Law & Order 26x7 on the 20th. pogdesign has 26x8 that day — its 26x7 was a week ago.
    const month = [...listed, { slug: "Law-and-Order", show: "Law & Order", season: 26, episode: 7, day: "2026-11-13" }];
    const c = compare([mine({ tmdbId: 20, show: "Law & Order", season: 26, episode: 7, airs: "2026-11-20" })], new Map([[20, new Map([["26x7", "2026-11-20"]])]]), new Map([[20, "Law-and-Order"]]), month, pages, window);
    // Neither "MOX is late with 26x7" nor "MOX is missing 26x8": both are the same miscount.
    expect(c.findings.map((f) => f.kind)).toEqual(["unverified", "unverified"]);
    expect(c.findings.some(isAlarm)).toBe(false);
    expect(c.findings[0].detail).toContain("numbers the season differently");
    // But when MOX has that other episode on that day as well, the difference stands.
    const both = new Map([[20, new Map([["26x7", "2026-11-20"], ["26x8", "2026-11-20"]])]]);
    expect(compare([mine({ tmdbId: 20, show: "Law & Order", season: 26, episode: 7, airs: "2026-11-20" })], both, new Map([[20, "Law-and-Order"]]), month, pages, window).findings[0].kind).toBe("late");
  });

  it("a season out at once here and one a day there is its own thing, not an alarm", () => {
    const eps = [1, 2, 3, 4].map((n) => mine({ tmdbId: 30, show: "Binge", season: 1, episode: n, airs: "2026-11-25" }));
    const month = [1, 2, 3, 4].map((n) => ({ slug: "Binge", show: "Binge", season: 1, episode: n, day: `2026-11-${24 + n}` }));
    const dates = new Map([[30, new Map(eps.map((e) => [`1x${e.episode}`, e.airs] as [string, string]))]]);
    const c = compare(eps, dates, new Map([[30, "Binge"]]), month, new Map(), window);
    // The first two are within a day, which the month page alone cannot tell apart; the rest are the run.
    expect(c.findings.map((f) => f.kind)).toEqual(["unverified", "unverified", "spread", "spread"]);
    expect(c.findings.some(isAlarm)).toBe(false);
    // Not one a day — weekly — is a real difference and stays an alarm.
    const weekly = [1, 2, 3, 4].map((n) => ({ slug: "Binge", show: "Binge", season: 1, episode: n, day: `2026-11-${String(18 + 7 * n).padStart(2, "0")}`.replace("2026-11-32", "2026-12-02").replace("2026-11-39", "2026-12-09").replace("2026-11-46", "2026-12-16") }));
    expect(compare(eps, dates, new Map([[30, "Binge"]]), weekly, new Map(), window).findings.map((f) => f.kind)).toEqual(["unverified", "early", "early", "early"]);
  });

  it("an episode pogdesign numbers differently, or has on another date, is unverified", () => {
    const c = compare([{ ...med, season: 13, episode: 1 }], new Map([[10, new Map([["13x1", "2026-11-19"], ["12x7", "2026-11-19"]])]]), new Map([[10, "Chicago-Med"]]), listed, pages, window);
    expect(c.findings.map((f) => f.kind)).toEqual(["unverified"]);
  });

  it("an episode on pogdesign this week that MOX has nowhere is missing", () => {
    const c = compare([], new Map([[10, new Map([["12x6", "2026-11-12"]])]]), new Map([[10, "Chicago-Med"]]), listed, pages, window, new Map([[10, "Chicago Med"]]));
    expect(c.findings).toHaveLength(1);
    expect(c.findings[0]).toMatchObject({ kind: "missing", show: "Chicago Med", season: 12, episode: 7, mine: null, theirs: "2026-11-19" });
  });

  it("an episode MOX has on some other date is not called missing", () => {
    const c = compare([], new Map([[10, new Map([["12x7", "2026-11-19"]])]]), new Map([[10, "Chicago-Med"]]), listed, pages, window);
    expect(c.findings).toEqual([]);
  });

  it("says nothing of pogdesign's episodes outside the week, or of shows he does not follow", () => {
    const c = compare([], new Map(), new Map([[10, "Chicago-Med"]]), listed, pages, { from: "2026-11-21", to: "2026-11-28" });
    expect(c.findings).toEqual([]);
  });
});

describe("the same show under two spellings", () => {
  it("folds case, punctuation, a leading article, and a tag in brackets", () => {
    expect(foldShow("Law & Order")).toBe(foldShow("Law and Order"));
    expect(foldShow("The Office (US)")).toBe(foldShow("Office"));
    expect(foldShow("Where's Wanda?")).toBe(foldShow("Wheres Wanda"));
    expect(foldShow("Doc (2020)")).toBe("doc");
    expect(foldShow("The Tonight Show [Fallon]")).toBe("tonight show");
  });

  it("does not fold two different shows together", () => {
    expect(foldShow("Dexter")).not.toBe(foldShow("Dexter: Resurrection"));
    expect(foldShow("12 12 12")).toBe("12 12 12");
  });
});

describe("the report with no model to write it", () => {
  it("never reads a night it could not check as all clear", () => {
    expect(plainSummary({ findings: [], agreed: 0, checked: 0 }, "unchecked")).toContain("ماقدرتش");
  });

  it("says all match when they do, and counts what does not", () => {
    expect(plainSummary({ findings: [], agreed: 9, checked: 9 }, "ok")).toContain("مطابقة");
    const early = judge(mine({ airs: "2026-11-18" }), aired({ at: "2026-11-19T01:00:00.000Z", network: "NBC" }))!;
    expect(plainSummary({ findings: [early], agreed: 8, checked: 9 }, "ok")).toContain("بدري");
  });
});
