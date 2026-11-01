"use client";

import { useEffect, type RefObject } from "react";

/**
 * Pull a sheet down to close it, as on the iPhone: from anywhere on it, not
 * just the handle, whenever its content is scrolled to the top. Pulling up,
 * or down while there is content above, scrolls as usual; a sideways swipe
 * is left to the rails.
 *
 * The sheet is moved by writing its transform directly, not through state:
 * a re-render per touch move made the drag lag behind the finger.
 */
export function useSwipeToClose(
  panel: RefObject<HTMLElement | null>,
  scroller: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const el = panel.current;
    // Only where the sheet rises from the bottom edge: phones (below `sm`).
    if (!el || !window.matchMedia("(max-width: 639px)").matches) return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let lastY = 0;
    let lastAt = 0;
    let speed = 0;
    let mode: "undecided" | "drag" | "scroll" = "scroll";
    let closing = false;

    const settle = (to: string, after?: () => void) => {
      el.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)";
      el.style.transform = to;
      let finished = false;
      const done = (e?: TransitionEvent) => {
        // A button's own transition inside bubbles up here too.
        if (finished || (e && e.target !== el)) return;
        finished = true;
        el.removeEventListener("transitionend", done);
        el.style.transition = "";
        after?.();
      };
      el.addEventListener("transitionend", done);
      // transitionend never comes if nothing moved.
      setTimeout(done, 260);
    };

    const start = (e: TouchEvent) => {
      if (closing || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = lastY = t.clientY;
      startedAt = lastAt = performance.now();
      speed = 0;
      const inside = scroller.current?.contains(e.target as Node);
      // Above the content (the handle, the close strip) always drags; inside it, only from the top.
      mode = !inside || (scroller.current?.scrollTop ?? 0) <= 0 ? "undecided" : "scroll";
    };

    const move = (e: TouchEvent) => {
      if (mode === "scroll") return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (mode === "undecided") {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // Sideways is a rail's; upwards is a scroll.
        mode = Math.abs(dx) > Math.abs(dy) || dy < 0 ? "scroll" : "drag";
        if (mode === "scroll") return;
        el.style.transition = "";
      }
      e.preventDefault();
      const now = performance.now();
      speed = (t.clientY - lastY) / Math.max(now - lastAt, 1);
      lastY = t.clientY;
      lastAt = now;
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };

    const end = () => {
      if (mode !== "drag") return;
      mode = "scroll";
      const travelled = lastY - startY;
      // Past a third of the sheet, or a quick flick downwards, and it goes.
      const flick = speed > 0.5 && performance.now() - startedAt < 600;
      if (travelled > el.offsetHeight * 0.3 || (flick && travelled > 20)) {
        closing = true;
        settle("translateY(100%)", onClose);
      } else {
        settle("translateY(0px)", () => (el.style.transform = ""));
      }
    };

    el.addEventListener("touchstart", start, { passive: true });
    // Not passive: a drag has to stop the page scrolling under the finger.
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [panel, scroller, onClose]);
}
