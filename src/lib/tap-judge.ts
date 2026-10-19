/**
 * Whether the click that ends a touch was meant as a tap — the decision
 * behind TapGuard, kept free of the DOM so it can be tested.
 *
 * On a phone almost all of Home opens a title, so a finger put down to
 * scroll, or to stop a list still gliding, kept opening things. A click that
 * follows a touch is dropped when the finger moved, when anything scrolled
 * between touching and lifting or just before, or when it was held long.
 * Mouse clicks and keyboard presses are never dropped.
 */

/** How far a finger may drift and still have tapped, in CSS pixels. */
export const SLOP = 10;
/** A touch this soon after anything scrolled was stopping the glide, not tapping. */
export const AFTER_SCROLL_MS = 250;
/** Held this long, it was a press — reading, or about to scroll — not a tap. */
export const LONG_PRESS_MS = 600;
/** A click this long after the finger lifted is not that touch's. */
const CLICK_WINDOW_MS = 500;

export type Pointer = "touch" | "pen" | "mouse" | string;

export function tapJudge() {
  let down: { x: number; y: number; at: number; touch: boolean } | null = null;
  let lastScroll = -Infinity;
  let liftedAt = -Infinity;
  let doubtful = false;

  return {
    scroll(now: number) {
      lastScroll = now;
      if (down?.touch) doubtful = true;
    },
    down(kind: Pointer, x: number, y: number, now: number) {
      const touch = kind === "touch" || kind === "pen";
      down = { x, y, at: now, touch };
      doubtful = touch && now - lastScroll < AFTER_SCROLL_MS;
    },
    move(x: number, y: number) {
      if (down?.touch && Math.hypot(x - down.x, y - down.y) > SLOP) doubtful = true;
    },
    up(now: number) {
      liftedAt = now;
      if (down?.touch && now - down.at > LONG_PRESS_MS) doubtful = true;
    },
    cancel() {
      doubtful = true;
    },
    /** True when this click should be dropped. One touch, one decision. */
    click(now: number): boolean {
      const fromTouch = !!down?.touch && now - liftedAt < CLICK_WINDOW_MS;
      const drop = fromTouch && doubtful;
      down = null;
      doubtful = false;
      return drop;
    },
  };
}
