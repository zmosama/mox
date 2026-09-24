import { describe, expect, it } from "vitest";
import { parseRace, parseResult, revealedRound, statusOf } from "./f1";

const baku = parseRace({
  season: "2026",
  round: "15",
  raceName: "Azerbaijan Grand Prix",
  date: "2026-09-26",
  time: "11:00:00Z",
  Circuit: { circuitName: "Baku City Circuit", Location: { locality: "Baku", country: "Azerbaijan" } },
  FirstPractice: { date: "2026-09-24", time: "08:30:00Z" },
  SecondPractice: { date: "2026-09-24", time: "12:00:00Z" },
  ThirdPractice: { date: "2026-09-25", time: "08:30:00Z" },
  Qualifying: { date: "2026-09-25", time: "12:00:00Z" },
});

const singapore = parseRace({
  season: "2026",
  round: "17",
  raceName: "Singapore Grand Prix",
  date: "2026-10-11",
  time: "12:00:00Z",
  Circuit: { circuitName: "Marina Bay", Location: { locality: "Singapore", country: "Singapore" } },
  FirstPractice: { date: "2026-10-09", time: "09:30:00Z" },
  SprintQualifying: { date: "2026-10-09", time: "13:30:00Z" },
  Sprint: { date: "2026-10-10", time: "09:00:00Z" },
  Qualifying: { date: "2026-10-10", time: "13:00:00Z" },
});

describe("parseRace", () => {
  it("lists every session in the order they run, the race last", () => {
    expect(baku.sessions.map((s) => s.kind)).toEqual(["fp1", "fp2", "fp3", "quali", "race"]);
    expect(baku.at).toBe("2026-09-26T11:00:00.000Z");
    expect(baku.sprint).toBe(false);
  });

  it("knows a sprint weekend", () => {
    expect(singapore.sprint).toBe(true);
    expect(singapore.sessions.map((s) => s.label)).toEqual([
      "Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race",
    ]);
  });
});

describe("statusOf", () => {
  const races = [baku, singapore];

  it("calls the first unfinished race next and the rest upcoming", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(statusOf(baku, races, now)).toBe("next");
    expect(statusOf(singapore, races, now)).toBe("upcoming");
  });

  it("is live for the race's first hours, then done", () => {
    expect(statusOf(baku, races, new Date("2026-09-26T12:00:00Z"))).toBe("live");
    expect(statusOf(baku, races, new Date("2026-09-26T15:00:00Z"))).toBe("done");
    expect(statusOf(singapore, races, new Date("2026-09-26T15:00:00Z"))).toBe("next");
  });
});

describe("revealedRound", () => {
  it("shows the latest finished round with the shield off", () => {
    expect(revealedRound([13, 14, 15], new Set(), false)).toBe(15);
  });

  it("with the shield on, stops at the latest round you watched", () => {
    expect(revealedRound([13, 14, 15], new Set([13]), true)).toBe(13);
    expect(revealedRound([13, 14, 15], new Set([13, 15]), true)).toBe(15);
    expect(revealedRound([13, 14, 15], new Set(), true)).toBeNull();
  });
});

describe("parseResult", () => {
  it("takes the finishing time, or the reason a car stopped", () => {
    const base = {
      Driver: { givenName: "Andrea Kimi", familyName: "Antonelli", code: "ANT" },
      Constructor: { name: "Mercedes" },
    };
    expect(parseResult({ ...base, position: "1", points: "25", Time: { time: "1:34:23.754" } })).toEqual({
      position: 1, driver: "Andrea Kimi Antonelli", code: "ANT", team: "Mercedes", detail: "1:34:23.754", points: 25,
    });
    expect(parseResult({ ...base, position: "19", status: "Retired" }).detail).toBe("Retired");
    expect(parseResult({ ...base, position: "1", Q3: "1:41.002" }).detail).toBe("1:41.002");
  });
});
