"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Poster } from "./Poster";
import { ServiceBadge, type Service } from "./ServiceBadge";
import { cn } from "@/lib/cn";
import { backdropUrl } from "@/lib/images";
import type { MediaKind, Verdict } from "@/db/schema";

export type SheetTitle = {
  tmdbId: number;
  kind: MediaKind;
  title: string;
  tagline: string | null;
  overview: string | null;
  year: number | null;
  releaseDate: string | null;
  runtime: number | null;
  seasons: number | null;
  genres: string[];
  rating: number | null;
  poster: string | null;
  backdrop: string | null;
  cast: string[];
  directors: string[];
  trailer: string | null;
  platforms: Service[];
  verdict: Verdict | null;
  following: boolean;
};

const VERDICT_BUTTONS: { verdict: Verdict; label: string; tone: string }[] = [
  { verdict: "love", label: "👍👍 Loved", tone: "data-[on=true]:bg-love data-[on=true]:text-[#04210f]" },
  { verdict: "like", label: "👍 Liked", tone: "data-[on=true]:bg-like data-[on=true]:text-[#04142b]" },
  { verdict: "dislike", label: "👎 Not for me", tone: "data-[on=true]:bg-against data-[on=true]:text-[#2b0505]" },
  { verdict: "watchlist", label: "🔖 Want to watch", tone: "data-[on=true]:bg-want data-[on=true]:text-[#2b1a02]" },
  { verdict: "seen", label: "✓ Seen it", tone: "data-[on=true]:bg-ink data-[on=true]:text-bg" },
  { verdict: "hidden", label: "✕ Not interested", tone: "data-[on=true]:bg-ink-faint data-[on=true]:text-bg" },
];

/**
 * The one place a title is acted on. Cards and rows open this rather than each
 * carrying their own buttons, so there is a single definition of what you can
 * do with a title.
 */
export function TitleSheet({
  tmdbId,
  kind,
  signedIn,
  onClose,
}: {
  tmdbId: number;
  kind: MediaKind;
  signedIn: boolean;
  onClose: () => void;
}) {
  /**
   * What was fetched, stored with which title it was fetched for.
   *
   * These were two pieces of state that the fetch effect had to blank on every
   * change of title. Tagging the response instead makes "we have nothing for
   * this one yet" derivable, and a reply for a title you have already navigated
   * away from can no longer be mistaken for this one's.
   */
  const id = `${kind}:${tmdbId}`;
  const [loaded, setLoaded] = useState<{
    for: string;
    data: SheetTitle | null;
    error: string | null;
  } | null>(null);

  const current = loaded?.for === id ? loaded : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  /** Reflect a change we just made, without re-fetching the whole title. */
  const patch = useCallback(
    (next: SheetTitle) => setLoaded({ for: id, data: next, error: null }),
    [id],
  );

  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Drag the sheet down to dismiss. Past a third of its height, let it go.
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const startY = e.clientY;
    const startedAt = performance.now();
    const height = e.currentTarget.parentElement?.getBoundingClientRect().height ?? 600;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSliding(false);

    const move = (ev: PointerEvent) => setOffset(Math.max(0, ev.clientY - startY));
    const end = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      setSliding(true);

      const travelled = ev.clientY - startY;
      const speed = travelled / Math.max(performance.now() - startedAt, 1);
      // A quick flick should close it even if it barely moved.
      if (travelled > height * 0.3 || speed > 0.6) onClose();
      else setOffset(0);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
  };

  useEffect(() => {
    let live = true;
    fetch(`/api/title/${kind}/${tmdbId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: SheetTitle) => live && setLoaded({ for: id, data: d, error: null }))
      .catch((e: Error) => live && setLoaded({ for: id, data: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [tmdbId, kind, id]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, [onClose]);

  const setVerdict = useCallback(
    async (verdict: Verdict) => {
      if (!data) return;
      const next = data.verdict === verdict ? null : verdict;
      setBusy(true);
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tmdbId: data.tmdbId, kind: data.kind, verdict: next }),
      });
      setBusy(false);
      if (res.ok) patch({ ...data, verdict: next });
    },
    [data, patch],
  );

  const toggleFollow = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    const res = await fetch("/api/follow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId: data.tmdbId, following: !data.following }),
    });
    setBusy(false);
    if (res.ok) patch({ ...data, following: !data.following });
  }, [data, patch]);

  const facts = data
    ? [
        data.year?.toString(),
        data.runtime ? `${data.runtime} min` : null,
        data.seasons ? `${data.seasons} season${data.seasons > 1 ? "s" : ""}` : null,
        data.genres.join(" · ") || null,
      ].filter(Boolean)
    : [];

  /**
   * Rendered on <body>, never where it was opened from.
   *
   * A z-index only competes inside its own stacking context. Opened from the
   * search field this sheet sat inside <header>, which is z-20, so the search
   * results — portalled to the body at z-45 — painted straight over it: the
   * sheet was there, correct and interactive, with only a sliver of it showing
   * above the results. Tapping a result looked like nothing happening.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={data?.title ?? "Title details"}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      /* Nearly opaque on purpose: at 72% a bright poster behind showed through
         and read as this card's own banner spilling past its edge. */
      /* On a phone this is a sheet that rises from the bottom edge, where the
         thumb already is; a centred dialog puts its close button and actions in
         the hardest part of the screen to reach. */
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#060608]/95 backdrop-blur-xl sm:items-center sm:p-6"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex w-full max-w-[720px] flex-col border-[#33333d] bg-card shadow-[0_-10px_60px_rgba(0,0,0,.7)]",
          // Full height on a phone: a half sheet wastes the screen and leaves
          // the actions crowded against the bottom edge.
          "h-[96dvh] rounded-t-[20px] border-x border-t",
          "sm:h-auto sm:max-h-[88dvh] sm:rounded-sheet sm:border sm:shadow-[0_30px_90px_rgba(0,0,0,.75)]",
          sliding ? "transition-transform duration-200" : "",
        )}
        style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      >
        {/* The handle is the visible affordance, but the whole strip across the
            top drags — aiming at a 4px bar with a thumb is a poor target. */}
        <div
          onPointerDown={startDrag}
          className="flex shrink-0 cursor-grab touch-none justify-center py-3.5 active:cursor-grabbing sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute end-3 top-3 z-10 grid size-11 place-items-center rounded-full border border-line-strong bg-bg/80 text-xl leading-none transition active:bg-raised sm:size-8 sm:text-lg sm:hover:bg-raised"
        >
          ×
        </button>

        {/* Width must be explicit: with only an aspect ratio and a capped
            height the browser derives width from height and the image stops
            short of the card's edge. */}
        <div
          className="h-[150px] w-full bg-surface bg-cover bg-center sm:h-[200px]"
          style={
            data?.backdrop || data?.poster
              ? { backgroundImage: `url('${backdropUrl(data.backdrop ?? data.poster!)}')` }
              : undefined
          }
        />

        {error ? (
          <p className="p-6 text-center text-ink-faint">Couldn’t load this title — {error}</p>
        ) : !data ? (
          <p className="p-6 text-center text-ink-faint">Loading…</p>
        ) : (
          /* items-start, or the flex row stretches the poster to the full height
             of the text column and overrides its aspect ratio. */
          /* The overlap is a desktop composition: the poster tucks up into the
             backdrop beside the text. Stacked on a phone it just sat on top of
             the hero, and the backdrop already shows the artwork there. */
          <div className="flex flex-col items-start gap-4 px-5 pb-6 sm:-mt-14 sm:flex-row sm:px-6">
            <Poster
              src={data.poster}
              alt={data.title}
              size="w342"
              className="hidden w-[118px] shrink-0 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.5)] sm:block"
            />

            <div className="min-w-0 flex-1 pt-4 sm:pt-14">
              <h2 className="text-xl font-bold leading-tight">{data.title}</h2>
              {data.tagline ? (
                <p className="mt-0.5 text-[13px] italic text-ink-dim">{data.tagline}</p>
              ) : null}

              <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-dim">
                {data.rating ? <b className="numeric text-want">★ {data.rating}</b> : null}
                <span>{facts.join(" · ")}</span>
              </p>

              {data.overview ? (
                <p className="my-3 text-sm leading-relaxed text-[#d2d5da]">{data.overview}</p>
              ) : null}

              <Facts label="Watch on">
                {data.platforms.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {data.platforms.map((p) => (
                      <ServiceBadge key={p.name} service={p} title={data.title} />
                    ))}
                  </span>
                ) : (
                  <span className="text-ink-faint">
                    {signedIn ? "Not on your services" : "Not on a tracked service"}
                  </span>
                )}
              </Facts>
              <Facts label="Director">{data.directors.join(", ")}</Facts>
              <Facts label="Cast">{data.cast.join(", ")}</Facts>
              <Facts label="Release">{data.releaseDate}</Facts>

              {data.trailer ? (
                <a
                  href={data.trailer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3.5 inline-flex items-center gap-2 rounded-lg bg-[#ff0033] px-4 py-2.5 text-[13px] font-bold text-white transition hover:brightness-110"
                >
                  <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                    <path d="M23 12s0-3.9-.5-5.8a3 3 0 0 0-2.1-2.1C18.5 3.6 12 3.6 12 3.6s-6.5 0-8.4.5A3 3 0 0 0 1.5 6.2C1 8.1 1 12 1 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 8.4.5 8.4.5s6.5 0 8.4-.5a3 3 0 0 0 2.1-2.1C23 15.9 23 12 23 12zM9.8 15.6V8.4l6.3 3.6-6.3 3.6z" />
                  </svg>
                  Watch trailer
                </a>
              ) : null}

              {signedIn ? (
                <div className="mt-4 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
                  {VERDICT_BUTTONS.map((b) => (
                    <button
                      key={b.verdict}
                      type="button"
                      disabled={busy}
                      data-on={data.verdict === b.verdict}
                      onClick={() => setVerdict(b.verdict)}
                      className={cn(
                        "min-h-11 rounded-lg border border-line-strong bg-raised px-3 text-[13px] font-semibold text-ink-dim transition",
                        "active:bg-[#25252e] sm:min-h-0 sm:py-2 sm:text-[12.5px] sm:hover:bg-[#25252e] sm:hover:text-ink",
                        "disabled:opacity-50 data-[on=true]:border-transparent",
                        b.tone,
                      )}
                    >
                      {b.label}
                    </button>
                  ))}

                  {data.kind === "tv" ? (
                    <>
                      <span className="hidden h-5 w-px bg-line-strong sm:mx-1 sm:block" />
                      <button
                        type="button"
                        disabled={busy}
                        data-on={data.following}
                        onClick={toggleFollow}
                        className={cn(
                          "col-span-2 min-h-11 rounded-lg border border-line-strong bg-raised px-3 text-[13px] font-semibold text-ink-dim transition",
                          "active:bg-[#25252e] sm:col-span-1 sm:min-h-0 sm:py-2 sm:text-[12.5px] sm:hover:bg-[#25252e] sm:hover:text-ink",
                          "disabled:opacity-50 data-[on=true]:border-transparent data-[on=true]:bg-love data-[on=true]:text-[#04210f]",
                        )}
                      >
                        {data.following ? "★ Following" : "☆ Follow"}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-[12.5px] text-ink-faint">
                  Sign in to rate this or add it to your list.
                </p>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Facts({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children || (Array.isArray(children) && !children.length)) return null;
  if (typeof children === "string" && !children.trim()) return null;
  return (
    <div className="my-1.5 flex items-baseline gap-2 text-[13px]">
      <span className="w-[74px] shrink-0 text-xs text-ink-faint">{label}</span>
      <span className="text-[#d2d5da]">{children}</span>
    </div>
  );
}
