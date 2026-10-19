"use client";

import { useEffect } from "react";
import { tapJudge } from "@/lib/tap-judge";

/**
 * Taps on a touch screen that were not meant as taps are dropped.
 *
 * Testers called the site's touch "too sensitive": on a phone almost all of
 * Home opens a title, so putting a finger down to scroll, or to stop a list
 * still gliding, kept opening things. Browsers have no setting for that; this
 * is it. The rule itself lives in tap-judge.ts.
 */
export function TapGuard() {
  useEffect(() => {
    const judge = tapJudge();
    const now = () => performance.now();

    const onScroll = () => judge.scroll(now());
    const onDown = (e: PointerEvent) => judge.down(e.pointerType, e.clientX, e.clientY, now());
    const onMove = (e: PointerEvent) => judge.move(e.clientX, e.clientY);
    const onUp = () => judge.up(now());
    const onCancel = () => judge.cancel();
    const onClick = (e: MouseEvent) => {
      if (!judge.click(now())) return;
      // Text fields take a touch to focus however it lands.
      if ((e.target as Element | null)?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const opts = { capture: true, passive: true } as const;
    window.addEventListener("scroll", onScroll, opts);
    window.addEventListener("pointerdown", onDown, opts);
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("pointerup", onUp, opts);
    window.addEventListener("pointercancel", onCancel, opts);
    // Not passive: it has to be able to cancel the click.
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("scroll", onScroll, opts);
      window.removeEventListener("pointerdown", onDown, opts);
      window.removeEventListener("pointermove", onMove, opts);
      window.removeEventListener("pointerup", onUp, opts);
      window.removeEventListener("pointercancel", onCancel, opts);
      window.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
