"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { TitleCard, type CardTitle } from "./TitleCard";
import { cn } from "@/lib/cn";
import { TitleSheet } from "./TitleSheet";
import type { MediaKind } from "@/db/schema";

/**
 * Search sits in the header and takes over the page while a query is active.
 * It looks in the catalog and in TMDB, so anything TMDB knows can be found and
 * rated even if it was never imported.
 */
export function Search({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);
  /* On a phone the field is a button until you tap it; a permanent input would
     eat the header, and the results need the whole screen anyway. */
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /**
   * The answer is stored with the question it answers.
   *
   * Holding results and a loading flag as their own state meant the effect had
   * to reset both on every keystroke, and a reply that arrived late could land
   * on top of a newer query. Tagging the response with its query makes both
   * facts derivable: results belong to the current query or they are not shown,
   * and "searching" is simply not having this query's answer yet.
   */
  const [answer, setAnswer] = useState<{ query: string; items: CardTitle[] } | null>(null);

  const q = query.trim();
  const active = q.length >= 2;
  /* The previous answer stays on screen while the next one is on its way —
     clearing it made the panel vanish and come back on every keystroke. */
  const results = active ? (answer?.items ?? null) : null;
  const loading = active && answer?.query !== q;

  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { results: CardTitle[] };
        setAnswer({ query: q, items: body.results });
      } catch {
        setAnswer({ query: q, items: [] });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  /**
   * Going anywhere closes the search.
   *
   * This lives in the header, so it outlives every page under it: the results
   * panel stayed up over whatever you had just navigated to, and with the real
   * page hidden behind it the header looked dead — the only way out was to
   * delete the query by hand. Two things end a search, because the pathname
   * alone does not catch all of them.
   */
  const dismiss = () => {
    setQuery("");
    setExpanded(false);
  };

  /* Adjusted during render rather than in an effect: an effect would let the
     stale results panel paint over the new page for a frame first. Covers the
     back button and any push the app makes itself; the listener below covers
     the rest. */
  const [shownFor, setShownFor] = useState(path);
  if (shownFor !== path) {
    setShownFor(path);
    dismiss();
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      /* Tapping "Board" while already on the board leaves the pathname alone,
         so the effect above never runs — and that was the click that felt most
         broken, because the page being asked for was already underneath. A
         link that opens a new tab is not going anywhere: every service badge on
         a result is one, and closing the search behind it would throw away the
         results the moment somebody went off to watch something. */
      const link = (e.target as HTMLElement | null)?.closest("a[href]");
      if (link && link.getAttribute("target") !== "_blank") dismiss();
    };
    // Capture, because a card stops the click before it ever reaches document.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === input.current) setQuery("");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => input.current?.focus());
        }}
        className="grid size-11 shrink-0 place-items-center rounded-full text-ink-dim transition active:bg-surface sm:hidden"
      >
        <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
          <path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
        </svg>
      </button>

      <div
        className={cn(
          "items-center gap-2",
          expanded
            ? "fixed inset-x-0 top-0 z-[46] flex h-[calc(3.5rem+env(safe-area-inset-top))] border-b border-line bg-bg px-3 pt-[env(safe-area-inset-top)] sm:static sm:h-auto sm:border-0 sm:p-0"
            : "hidden sm:flex",
        )}
      >
        {/* The field owns its own clear button. On a phone "Cancel" was the way
            out; on a desktop there was none at all short of selecting the text
            and deleting it, and Escape is not a thing anyone guesses. */}
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything…"
            aria-label="Search"
            enterKeyHint="search"
            className="w-full rounded-full border border-line-strong bg-surface py-2.5 pe-10 ps-3.5 text-base outline-none transition focus:border-like sm:w-56 sm:py-1.5 sm:pe-8 sm:text-[13px]"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
              className="absolute inset-y-0 end-0 grid w-10 place-items-center text-xl leading-none text-ink-faint transition hover:text-ink sm:w-8 sm:text-base"
            >
              ×
            </button>
          ) : null}
        </div>
        {expanded ? (
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              setQuery("");
            }}
            className="shrink-0 px-2 text-[13px] font-medium text-ink-dim sm:hidden"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {/* Portalled to <body>: rendered where this component sits, the panel was
          trapped inside the header's stacking context and the page behind drew
          straight over it. No mounted guard is needed — `results` is null until
          somebody types, which cannot happen before hydration. */}
      {results
        ? createPortal(
            <div className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-[45] overflow-auto overscroll-contain bg-bg px-4 pb-24 pt-5 sm:px-6 sm:pb-16">
          <div className="mx-auto max-w-[1180px]">
            <h2 className="mb-1 flex items-center gap-2.5 text-base font-semibold">
              Results for “{query.trim()}”
              <span className="numeric rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11px] text-ink-dim">
                {results.length}
              </span>
            </h2>
            <p className="mb-4 text-[13px] text-ink-faint">
              {loading ? "Searching…" : "Open one to rate it, follow it, or add it to your list."}
            </p>

            {results.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                {results.map((t) => (
                  <TitleCard
                    key={`${t.tmdbId}-${t.kind}`}
                    item={t}
                    onOpen={(i) => setOpen({ tmdbId: i.tmdbId, kind: i.kind })}
                  />
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-ink-faint">Nothing found</p>
            )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {open ? (
        <TitleSheet
          tmdbId={open.tmdbId}
          kind={open.kind}
          signedIn={signedIn}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
