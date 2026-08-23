"use client";

import { useMemo, useState } from "react";
import { Poster } from "./Poster";
import { cn } from "@/lib/cn";
import { VERDICTS, type MediaKind, type Verdict } from "@/db/schema";

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

const ACTIONS: { verdict: Verdict; icon: string; label: string; on: string }[] = [
  { verdict: "hidden", icon: "🚫", label: "Don’t show me this", on: "bg-ink-faint" },
  { verdict: "dislike", icon: "👎", label: "Not for me", on: "bg-against" },
  { verdict: "like", icon: "👍", label: "Liked it", on: "bg-like" },
  { verdict: "love", icon: "👍👍", label: "Loved it", on: "bg-love" },
  { verdict: "watchlist", icon: "🔖", label: "Want to watch", on: "bg-want" },
];

const RING: Record<Verdict, string> = {
  love: "ring-love",
  like: "ring-like",
  watchlist: "ring-want",
  dislike: "ring-against",
  hidden: "ring-ink-faint",
  seen: "ring-line-strong",
};

const FILTERS: { id: string; label: string; test: (i: WallItem) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "unrated", label: "Unrated", test: (i) => !i.verdict },
  { id: "tv", label: "TV", test: (i) => i.kind === "tv" },
  { id: "movie", label: "Films", test: (i) => i.kind === "movie" },
  { id: "ar", label: "Arabic", test: (i) => i.lang === "ar" },
  ...VERDICTS.map((v) => ({
    id: v,
    label: v[0].toUpperCase() + v.slice(1),
    test: (i: WallItem) => i.verdict === v,
  })),
];

export function RatingWall({ items: initial }: { items: WallItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const rated = items.filter((i) => i.verdict).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return items.filter((i) => {
      if (!test(i)) return false;
      if (q) return i.title.toLowerCase().includes(q);
      // Hidden titles stay out of sight unless you deliberately look for them.
      return filter === "hidden" || i.verdict !== "hidden";
    });
  }, [items, filter, query]);

  async function rate(item: WallItem, verdict: Verdict) {
    const next = item.verdict === verdict ? null : verdict;
    setItems((prev) =>
      prev.map((i) => (i.tmdbId === item.tmdbId && i.kind === item.kind ? { ...i, verdict: next } : i)),
    );
    const res = await fetch("/api/verdict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId: item.tmdbId, kind: item.kind, verdict: next }),
    });
    if (!res.ok) {
      // put it back rather than leave the screen claiming something untrue
      setItems((prev) =>
        prev.map((i) =>
          i.tmdbId === item.tmdbId && i.kind === item.kind ? { ...i, verdict: item.verdict } : i,
        ),
      );
    }
  }

  return (
    <>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 mb-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="mb-2.5 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
            <div
              className="h-full rounded-full bg-gradient-to-r from-like to-love transition-[width] duration-300"
              style={{ width: `${items.length ? (rated / items.length) * 100 : 0}%` }}
            />
          </div>
          <span className="numeric shrink-0 text-xs font-semibold text-ink-dim">
            {rated} / {items.length}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-36 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] outline-none transition focus:border-like sm:w-52"
          />
        </div>

        <div className="strip gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-[13px] font-medium transition whitespace-nowrap sm:min-h-0 sm:px-3 sm:py-1 sm:text-[12.5px]",
                filter === f.id
                  ? "border-ink bg-ink font-semibold text-bg"
                  : "border-line-strong text-ink-dim hover:border-ink-faint hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))]">
        {shown.map((item) => (
          <div key={`${item.tmdbId}-${item.kind}`} className="group relative">
            <div
              className={cn(
                "relative overflow-hidden rounded-tile",
                item.verdict && `ring-2 ring-inset ${RING[item.verdict]}`,
                item.verdict === "dislike" || item.verdict === "hidden" ? "opacity-45" : "",
              )}
            >
              <Poster src={item.poster} alt={item.title} size="w185" className="w-full" />

              {/* Always visible on touch — there is no hover to reveal them. */}
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/95 to-transparent p-1.5 pt-8 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                {ACTIONS.map((a) => (
                  <button
                    key={a.verdict}
                    type="button"
                    title={a.label}
                    aria-label={a.label}
                    onClick={() => rate(item, a.verdict)}
                    className={cn(
                      "grid size-9 place-items-center rounded-full border border-white/25 bg-[#16161a]/90 text-xs transition active:scale-95 sm:size-7 sm:text-[11px] sm:hover:scale-110 sm:hover:border-white",
                      item.verdict === a.verdict ? `${a.on} border-transparent` : "",
                    )}
                  >
                    {a.icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-1.5 truncate text-[12.5px] font-semibold">{item.title}</div>
            <div className="numeric text-[11px] text-ink-faint">
              {item.year ?? ""}
              {item.kind === "tv" ? " · TV" : ""}
            </div>
          </div>
        ))}
      </div>

      {!shown.length ? (
        <p className="py-16 text-center text-ink-faint">Nothing here</p>
      ) : null}
    </>
  );
}
