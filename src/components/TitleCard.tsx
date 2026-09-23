"use client";

import { Poster } from "./Poster";
import { cn } from "@/lib/cn";
import type { MediaKind, Verdict } from "@/db/schema";

export type CardTitle = {
  tmdbId: number;
  kind: MediaKind;
  title: string;
  year: number | null;
  poster: string | null;
  rating: number | null;
  verdict: Verdict | null;
  platforms: { name: string; logo: string | null; url: string | null }[];
  /** Shown instead of the service chip on titles that are not out yet. */
  releaseLabel?: string;
  /**
   * "S01E06", or "3 episodes". Shown alongside the service chip rather than in
   * place of it: an episode that just landed is the one case where where to
   * watch it and what arrived are both the point.
   */
  episodeLabel?: string;
  /** "EGP 29.99 rent · EGP 99.99 buy". Only the store section sets this. */
  price?: string;
  /** The day it turned up, for ordering. Not rendered. */
  arrived?: string;
  /** Why it is here for you: "Because you like Tom Hardy". */
  reason?: string;
};

const RING: Record<Verdict, string> = {
  love: "ring-love",
  like: "ring-like",
  watchlist: "ring-want",
  dislike: "ring-against",
  hidden: "ring-ink-faint",
  seen: "ring-line-strong",
};

/**
 * One card, used by every grid in the app. The previous version copied this
 * markup into four places, so a fix applied to one of them and the pages
 * drifted apart.
 *
 * Drawn to match the iPhone app's PosterCard: a rounded poster, what is new
 * about it in a mint tag on top, and underneath the title and where it streams.
 */
export function TitleCard({
  item,
  onOpen,
  className,
}: {
  item: CardTitle;
  onOpen?: (item: CardTitle) => void;
  className?: string;
}) {
  const service = item.platforms[0];
  const tag = item.releaseLabel ?? item.episodeLabel;
  const caption = item.price ?? item.reason ?? service?.name ?? (item.year ? String(item.year) : "");

  return (
    <div className={cn("group relative", className)} data-tmdb-id={item.tmdbId} data-kind={item.kind}>
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        aria-label={`Open ${item.title}`}
        className={cn(
          "relative block w-full overflow-hidden rounded-card bg-surface",
          "transition-transform duration-150 group-hover:scale-[1.03]",
          "focus-visible:outline-2 focus-visible:outline-love focus-visible:outline-offset-2",
          item.verdict && `ring-2 ring-inset ${RING[item.verdict]}`,
          item.verdict === "dislike" && "opacity-45",
        )}
      >
        <Poster src={item.poster} alt={item.title} size="w185" className="w-full" />

        {tag ? (
          <span className="numeric absolute start-1.5 top-1.5 z-10 rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-semibold text-love-soft">
            {tag}
          </span>
        ) : null}
      </button>

      <div className="mt-2 truncate text-[13px] font-medium leading-snug">{item.title}</div>
      <div
        className={cn(
          "numeric truncate text-[11.5px]",
          item.price ? "font-semibold text-want" : item.reason ? "text-love-soft" : "text-ink-dim",
        )}
      >
        {caption || "\u00a0"}
      </div>
    </div>
  );
}
