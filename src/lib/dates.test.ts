import { describe, expect, it } from "vitest";
import { addDaysISO, dayLabel, todayISO } from "./dates";

describe("Cairo calendar dates", () => {
  it("moves to the next day at Cairo midnight rather than UTC midnight", () => {
    expect(todayISO(new Date("2026-08-21T21:30:00Z"))).toBe("2026-08-22");
  });

  it("adds calendar days across month boundaries", () => {
    expect(addDaysISO("2026-08-31", 2)).toBe("2026-09-02");
  });

  it("labels days independently of the machine timezone", () => {
    expect(dayLabel("2026-08-22", "2026-08-22")).toBe("Today");
    expect(dayLabel("2026-08-23", "2026-08-22")).toBe("Tomorrow");
    expect(dayLabel("2026-08-24", "2026-08-22")).toBe("Mon 24 Aug");
  });
});
