"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Titles the sheet has fetched, kept for a few minutes.
 *
 * Opening a title cost a round trip to New York after the tap — over half a
 * second from Cairo — and opening it again cost the same. Now a title is
 * fetched once and kept; on a computer it is fetched while the pointer rests
 * on its card, so it is usually there before the click. Not on touch: a finger
 * goes down on a card to scroll far more often than to open it, and each of
 * those would be a request.
 */
const KEEP = 5 * 60_000;
const kept = new Map<string, { at: number; title: Promise<unknown> }>();

export function loadTitle<T>(kind: string, tmdbId: number): Promise<T> {
  const id = `${kind}:${tmdbId}`;
  const hit = kept.get(id);
  if (hit && Date.now() - hit.at < KEEP) return hit.title as Promise<T>;
  const title = fetch(`/api/title/${kind}/${tmdbId}`).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
  );
  // A failure isn't kept: the next open asks again.
  title.catch(() => kept.delete(id));
  kept.set(id, { at: Date.now(), title });
  return title as Promise<T>;
}

/** What the sheet just changed (a rating, a follow), so reopening shows it. */
export function keepTitle(kind: string, tmdbId: number, title: unknown) {
  kept.set(`${kind}:${tmdbId}`, { at: Date.now(), title: Promise.resolve(title) });
  changedAt = Date.now();
}

/** Something changed a title outside its sheet (a rating, an episode ticked): ask afresh next time. */
export function forgetTitles() {
  kept.clear();
  changedAt = Date.now();
}

/**
 * When this account last rated, saved, followed or ticked something.
 *
 * Pages are drawn on the server from those and then kept by the browser for
 * `staleTimes.dynamic` seconds (next.config.ts), so without this a title saved
 * on Home was missing from My List for half a minute, and one removed inside a
 * sheet stayed in the grid behind it.
 */
let changedAt = 0;

/** How long the browser keeps a page, plus a little. Matches next.config.ts. */
const KEPT_FOR = 35_000;

/** In a sheet: redraw the page behind it on closing, if the sheet changed anything. */
export function useRefreshOnClose() {
  const router = useRouter();
  useEffect(() => {
    const opened = Date.now();
    return () => {
      if (changedAt >= opened) router.refresh();
    };
  }, [router]);
}

/** On <body> once: a page reached just after a change is asked for again, not taken from the browser's copy. */
export function KeepFresh() {
  const router = useRouter();
  const path = usePathname();
  /** When each page was last drawn from the server. */
  const drawn = useRef(new Map<string, number>());
  useEffect(() => {
    const now = Date.now();
    const before = drawn.current.get(path);
    drawn.current.set(path, now);
    // Only a copy the browser may still be holding, made before the change.
    if (before !== undefined && before <= changedAt && now - before < KEPT_FOR) router.refresh();
  }, [path, router]);
  return null;
}

/** On <body> once: fetch the title under a resting mouse pointer. */
export function TitlePrefetch() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(timer);
      const card = (e.target as Element | null)?.closest<HTMLElement>("[data-tmdb-id]");
      const id = Number(card?.dataset.tmdbId);
      const kind = card?.dataset.kind;
      if (!id || !kind) return;
      // Resting, not passing over on the way somewhere else.
      timer = setTimeout(() => loadTitle(kind, id).catch(() => {}), 120);
    };
    window.addEventListener("pointerover", over, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerover", over);
    };
  }, []);
  return null;
}
