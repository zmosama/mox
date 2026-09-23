"use client";

import { useEffect, useMemo, useState } from "react";
import { Poster } from "./Poster";
import { Tabs } from "./Tabs";
import { cn } from "@/lib/cn";
import type { MediaKind, Verdict } from "@/db/schema";

export type WallItem = {
  tmdbId: number;
  kind: MediaKind;
  title: string;
  year: number | null;
  poster: string | null;
  rating: number | null;
  lang: string | null;
  verdict: Verdict | null;
};

/** The choices, in the app's order, with its icons. */
const ACTIONS: { verdict: Verdict; label: string; icon: string }[] = [
  { verdict: "love", label: "Loved it", icon: "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2 0 3.3 1 5.3 3 2-2 3.3-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" },
  { verdict: "like", label: "Liked it", icon: "M2 10h4v11H2zm6 11V10l5-7 1.2.8c.5.4.7 1 .6 1.6L14 9h6.5c1 0 1.8 1 1.5 2l-2 8.5c-.2.9-1 1.5-1.9 1.5H8z" },
  { verdict: "dislike", label: "Not for me", icon: "M22 14h-4V3h4zm-6-11v11l-5 7-1.2-.8c-.5-.4-.7-1-.6-1.6L10 15H3.5c-1 0-1.8-1-1.5-2l2-8.5C4.2 3.6 5 3 5.9 3H16z" },
  { verdict: "watchlist", label: "Want to watch", icon: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" },
  { verdict: "hidden", label: "Don’t show me this", icon: "M2.8 1.4 1.4 2.8l3.2 3.2C3 7.3 1.8 9 1 12c1.7 4.4 6 7.5 11 7.5 1.8 0 3.5-.4 5-1.1l4.2 4.2 1.4-1.4L2.8 1.4zM12 6.5c-.9 0-1.8.2-2.6.5l1.9 1.9L12 8.9a3 3 0 0 1 3.1 3.1v.7l3.4 3.4c1.9-1.2 3.4-2.9 4.5-5.1-1.7-4.4-6-7.5-11-7.5z" },
];

const SEEN_ICON = "M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z";

/** The website's verdict colours, as in the app's rating wall. */
const TONE: Record<Verdict, { ring: string; badge: string }> = {
  love: { ring: "ring-love", badge: "bg-love" },
  like: { ring: "ring-like", badge: "bg-like" },
  dislike: { ring: "ring-against", badge: "bg-against" },
  watchlist: { ring: "ring-want", badge: "bg-want" },
  hidden: { ring: "ring-ink-faint", badge: "bg-ink-faint" },
  seen: { ring: "ring-ink-faint", badge: "bg-ink-faint" },
};

const FILTERS: [id: string, label: string, test: (i: WallItem) => boolean][] = [
  ["unrated", "Unrated", (i) => !i.verdict],
  ["all", "All", () => true],
  ["tv", "TV", (i) => i.kind === "tv"],
  ["movie", "Films", (i) => i.kind === "movie"],
];

/**
 * Every title, most likely-seen first — the iPhone app's Rate titles screen.
 * Tap a poster for the choices; the ring and badge on it show what you picked.
 */
export function RatingWall({ items: initial }: { items: WallItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState("unrated");
  const [query, setQuery] = useState("");
  /** Which poster's menu is up, and where to draw it on screen. */
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const open = menu?.id ?? null;
  const setOpen = (id: null) => setMenu(id);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find(([id]) => id === filter)![2];
    return items.filter((i) => test(i) && (!q || i.title.toLowerCase().includes(q)));
  }, [items, filter, query]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    // Drawn fixed to the screen, so it would drift off its poster on scroll.
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
    };
  }, [open]);

  async function rate(item: WallItem, next: Verdict | null) {
    setOpen(null);
    const same = (i: WallItem) => i.tmdbId === item.tmdbId && i.kind === item.kind;
    setItems((prev) => prev.map((i) => (same(i) ? { ...i, verdict: next } : i)));
    const res = await fetch("/api/verdict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId: item.tmdbId, kind: item.kind, verdict: next }),
    }).catch(() => null);
    // Put it back rather than leave the screen claiming something untrue.
    if (!res?.ok) setItems((prev) => prev.map((i) => (same(i) ? { ...i, verdict: item.verdict } : i)));
  }

  return (
    <>
      <h1 className="mb-5 text-[28px] font-bold tracking-tight">Rate titles</h1>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs className="sm:w-[420px]" value={filter} onChange={setFilter} options={FILTERS.map(([id, label]) => [id, label])} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a title…"
          aria-label="Find a title"
          className="h-11 rounded-full border border-white/10 bg-white/[0.06] px-4 text-[14px] outline-none transition placeholder:text-ink-dim focus:border-love/60 sm:ms-auto sm:w-64"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
        {shown.map((item) => {
          const id = `${item.kind}-${item.tmdbId}`;
          const tone = item.verdict ? TONE[item.verdict] : null;
          const icon = item.verdict === "seen" ? SEEN_ICON : ACTIONS.find((a) => a.verdict === item.verdict)?.icon;
          return (
            <div key={id} className={cn("relative", open === id && "z-20")}>
              <button
                type="button"
                aria-label={`Rate ${item.title}`}
                aria-expanded={open === id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (open === id) return setOpen(null);
                  // Centred on the poster, but kept on screen at the edges.
                  const r = e.currentTarget.getBoundingClientRect();
                  const half = 128;
                  const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
                  setMenu({ id, x, y: Math.min(r.top + 12, window.innerHeight - 340) });
                }}
                className="block w-full text-start"
              >
                <span
                  className={cn(
                    "relative block overflow-hidden rounded-card transition",
                    (item.verdict === "dislike" || item.verdict === "hidden") && "opacity-45",
                  )}
                >
                  <Poster src={item.poster} alt={item.title} size="w185" className="w-full" />
                  {/* Its own layer over the poster: an inset ring on the frame
                      itself is painted under the image and never shows. */}
                  {tone ? (
                    <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-card ring-[3px] ring-inset", tone.ring)} />
                  ) : null}
                  {tone && icon ? (
                    <span className={cn("absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-full text-bg", tone.badge)}>
                      <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
                        <path d={icon} />
                      </svg>
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 block truncate text-[12.5px] font-medium">{item.title}</span>
                <span className="numeric block text-[11px] text-ink-dim">{item.year ?? " "}</span>
              </button>

              {menu && open === id ? (
                <div
                  role="menu"
                  onClick={(e) => e.stopPropagation()}
                  style={{ left: menu.x, top: menu.y }}
                  className="fixed z-40 w-64 -translate-x-1/2 overflow-hidden rounded-[22px] border border-white/10 bg-[#1b201e]/95 py-1.5 shadow-pop backdrop-blur-2xl"
                >
                  {ACTIONS.map((a) => (
                    <button
                      key={a.verdict}
                      role="menuitem"
                      type="button"
                      onClick={() => rate(item, item.verdict === a.verdict ? null : a.verdict)}
                      className="flex w-full items-center gap-3.5 px-4 py-2.5 text-start text-[15px] transition hover:bg-white/5"
                    >
                      <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-love" aria-hidden>
                        <path d={a.icon} />
                      </svg>
                      <span className={cn(item.verdict === a.verdict && "text-love")}>{a.label}</span>
                    </button>
                  ))}
                  {item.verdict ? (
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => rate(item, null)}
                      className="w-full border-t border-white/10 px-4 py-2.5 text-start text-[15px] text-against transition hover:bg-white/5"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!shown.length ? <p className="py-16 text-center text-ink-faint">Nothing here</p> : null}
    </>
  );
}
