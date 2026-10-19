import { describe, expect, it } from "vitest";
import { tapJudge } from "./tap-judge";

/** A touch at (100, 100): down at `at`, optionally moved, lifted `held` later, clicked at once. */
function touch(j: ReturnType<typeof tapJudge>, at: number, { move = 0, held = 80, kind = "touch" } = {}) {
  j.down(kind, 100, 100, at);
  if (move) j.move(100, 100 + move);
  j.up(at + held);
  return j.click(at + held + 5);
}

describe("tapJudge", () => {
  it("lets a plain tap through", () => {
    expect(touch(tapJudge(), 1000)).toBe(false);
  });

  it("lets a finger that wobbles a little through", () => {
    expect(touch(tapJudge(), 1000, { move: 6 })).toBe(false);
  });

  it("drops a touch that moved — the start of a scroll", () => {
    expect(touch(tapJudge(), 1000, { move: 40 })).toBe(true);
  });

  it("drops a touch that stops a list still gliding", () => {
    const j = tapJudge();
    j.scroll(1000);
    expect(touch(j, 1100)).toBe(true);
  });

  it("drops a touch during which something scrolled", () => {
    const j = tapJudge();
    j.down("touch", 100, 100, 1000);
    j.scroll(1040);
    j.up(1080);
    expect(j.click(1085)).toBe(true);
  });

  it("drops a long press", () => {
    expect(touch(tapJudge(), 1000, { held: 700 })).toBe(true);
  });

  it("lets a tap through once scrolling has settled", () => {
    const j = tapJudge();
    j.scroll(1000);
    expect(touch(j, 1400)).toBe(false);
  });

  it("never drops a mouse click, scrolled or not", () => {
    const j = tapJudge();
    j.scroll(1000);
    expect(touch(j, 1010, { kind: "mouse", move: 40, held: 900 })).toBe(false);
  });

  it("judges each touch once — a later click is not held against it", () => {
    const j = tapJudge();
    expect(touch(j, 1000, { move: 40 })).toBe(true);
    // A keyboard or scripted click long after: no touch behind it.
    expect(j.click(5000)).toBe(false);
  });

  it("does not hold a dropped touch against the next tap", () => {
    const j = tapJudge();
    expect(touch(j, 1000, { move: 40 })).toBe(true);
    expect(touch(j, 3000)).toBe(false);
  });
});
