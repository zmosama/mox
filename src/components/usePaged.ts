"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Page<T, X> = { items: T[]; next: number | null; extra: X | null };

/**
 * A list that loads one page at a time and the next when you scroll near its
 * end: search, a studio's work, friends' ratings. The server answers each
 * page with `next`, the page to ask for after it, or null at the end.
 *
 * `url` is the list without its page; a new one starts over. `read` takes the
 * items out of a response, and `extra` anything else the first page carries.
 */
export function usePaged<T, X = null>(
  url: string | null,
  read: (body: Record<string, unknown>) => { items: T[]; next: number | null; extra?: X },
) {
  const [state, setState] = useState<Page<T, X> & { url: string | null; failed: boolean }>({
    url: null,
    items: [],
    next: null,
    extra: null,
    failed: false,
  });
  /** The page being fetched, so a second scroll does not ask for it twice. */
  const inflight = useRef<string | null>(null);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const current = useRef(url);
  // A callback ref, so the watcher is set up again when the element appears.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  const load = useCallback(async (target: string, page: number) => {
    const ask = `${target}#${page}`;
    if (inflight.current === ask) return;
    inflight.current = ask;
    try {
      const res = await fetch(`${target}${target.includes("?") ? "&" : "?"}page=${page}`);
      const body = (await res.json()) as Record<string, unknown>;
      if (current.current !== target) return;
      const got = readRef.current(body);
      setState((s) => ({
        url: target,
        items: page === 1 ? got.items : [...s.items, ...got.items],
        next: got.next,
        extra: page === 1 ? (got.extra ?? null) : s.extra,
        failed: !res.ok,
      }));
    } catch {
      if (current.current === target) setState((s) => ({ ...s, url: target, failed: true, next: null }));
    } finally {
      if (inflight.current === ask) inflight.current = null;
    }
  }, []);

  useEffect(() => {
    current.current = url;
    if (url) void load(url, 1);
  }, [url, load]);

  /* Re-made whenever the list grows, so a page too short to reach the bottom
     of the screen asks for the one after it straight away. */
  const { next, items } = state;
  const fresh = state.url === url;
  useEffect(() => {
    const el = sentinel;
    if (!el || !url || !fresh || next === null) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load(url, next);
      },
      { rootMargin: "600px 0px" },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [sentinel, url, fresh, next, items.length, load]);

  return {
    items: fresh ? state.items : [],
    extra: fresh ? state.extra : null,
    /** The first page has not come back yet. */
    pending: url !== null && !fresh,
    more: fresh && state.next !== null,
    failed: fresh && state.failed,
    /** Put this after the list: reaching it loads the next page. */
    sentinel: setSentinel,
  };
}
