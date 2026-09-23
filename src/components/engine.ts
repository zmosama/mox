"use client";

import { useSyncExternalStore } from "react";

/**
 * Which rendering engine is drawing the page, for the one place that needs it.
 *
 * The ring on Home is built from layer blending and blur, and Safari (WebKit)
 * composites those differently from Chrome (Blink): the same CSS gave a clean
 * ring in Chrome and, in Safari, a dark box, tiles and a washed-out glow. So
 * the ring has two builds, each checked in its own browser, and this picks one.
 *
 * "unknown" on the server and during hydration, so neither build flashes
 * before the right one is known.
 */
export type Engine = "safari" | "other" | "unknown";

const subscribe = () => () => {};

function detect(): Engine {
  // `?engine=safari` or `?engine=other` forces a build, for checking one
  // browser's version of the ring in the other.
  const forced = new URLSearchParams(location.search).get("engine");
  if (forced === "safari" || forced === "other") return forced;

  const ua = navigator.userAgent;
  /* Every browser on an iPhone or iPad is WebKit underneath — Apple requires
     it — so Chrome there draws like Safari and needs Safari's build. iPadOS
     reports itself as a Mac, so a Mac with a touch screen counts too. */
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return "safari";
  // Elsewhere, Chrome, Edge, Firefox and friends all mention Safari too; only
  // real Safari mentions it without one of them.
  return /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|opr|android/i.test(ua) ? "safari" : "other";
}

export function useEngine(): Engine {
  return useSyncExternalStore(subscribe, detect, () => "unknown");
}
