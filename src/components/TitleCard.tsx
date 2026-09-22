"use client";

import { Poster } from "./Poster";
import { ServiceBadge } from "./ServiceBadge";
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

  return (
    <div className={cn("group relative", className)} data-tmdb-id={item.tmdbId} data-kind={item.kind}>
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        aria-label={`Open ${item.title}`}
        className={cn(
          "relative block w-full overflow-hidden rounded-tile bg-surface shadow-card",
          "ring-1 ring-inset ring-white/10",
          "transition-transform duration-150 group-hover:scale-[1.03]",
          "focus-visible:outline-2 focus-visible:outline-like focus-visible:outline-offset-2",
          item.verdict && `ring-2 ring-inset ${RING[item.verdict]}`,
          item.verdict === "dislike" && "opacity-45",
        )}
      >
        <Poster src={item.poster} alt={item.title} size="w185" className="w-full" />

        {item.releaseLabel ? (
          <span className="absolute start-1.5 top-1.5 z-10 rounded-md bg-want px-1.5 py-0.5 text-[10.5px] font-bold text-[#2b1a02]">
            {item.releaseLabel}
          </span>
        ) : null}

        {item.rating ? (
          <span className="numeric absolute bottom-1.5 start-1.5 z-10 rounded-md bg-black/80 px-1.5 py-0.5 text-[10.5px] font-semibold text-want">
            ★ {item.rating}
          </span>
        ) : null}

        {item.episodeLabel ? (
          <span className="numeric absolute bottom-1.5 end-1.5 z-10 rounded-md bg-love px-1.5 py-0.5 text-[10.5px] font-bold text-[#04210f]">
            {item.episodeLabel}
          </span>
        ) : null}

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-3xl opacity-0 transition-opacity group-hover:opacity-100"
        >
          ⓘ
        </span>
      </button>

      {/* A link cannot legally live inside the button above. Overlay it as a
          sibling so the service shortcut and the details button remain two
          independent keyboard targets. */}
      {!item.releaseLabel && service ? (
        <span className="absolute start-1.5 top-1.5 z-10">
          <ServiceBadge service={service} title={item.title} iconOnly />
        </span>
      ) : null}

      <div className="mt-2 text-[13px] font-semibold leading-snug">{item.title}</div>
      <div className="numeric text-[11.5px] font-medium text-ink-faint">
        {item.year ?? ""}
        {item.kind === "tv" ? " · TV" : ""}
      </div>
      {item.price ? (
        <div className="numeric text-[11.5px] font-semibold text-want">{item.price}</div>
      ) : null}
    </div>
  );
}
