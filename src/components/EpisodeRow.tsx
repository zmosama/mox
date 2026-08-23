"use client";

import { useState } from "react";
import { Poster } from "./Poster";
import { ServiceBadge } from "./ServiceBadge";
import { cn } from "@/lib/cn";
import { episodeCode } from "@/lib/dates";
import type { CalendarEpisode } from "@/lib/queries";
import type { MediaKind } from "@/db/schema";

/**
 * One line of the calendar.
 *
 * The whole row opens the title; the follow star is the single exception and
 * stops the event itself. An earlier version gave three parts of the row three
 * different behaviours depending on where you pressed.
 */
export function EpisodeRow({
  episode,
  signedIn = false,
  prominent = false,
  onOpen,
}: {
  episode: CalendarEpisode;
  signedIn?: boolean;
  prominent?: boolean;
  onOpen: (ref: { tmdbId: number; kind: MediaKind }) => void;
}) {
  const [following, setFollowing] = useState(episode.following);
  const [busy, setBusy] = useState(false);

  const open = () => episode.tmdbId && onOpen({ tmdbId: episode.tmdbId, kind: "tv" });

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!episode.tmdbId) return;
    setBusy(true);
    const res = await fetch("/api/follow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId: episode.tmdbId, following: !following }),
    });
    setBusy(false);
    if (res.ok) setFollowing(!following);
  };

  const available = episode.platforms.length > 0;

  return (
    <div
      className={cn(
        "group relative flex min-w-0 items-center gap-3 px-4 py-2.5 transition sm:py-2",
        prominent ? "border-b border-white/5 last:border-0" : "border-t border-white/5 first:border-t-0",
        episode.tmdbId ? "cursor-pointer hover:bg-white/5" : "",
        !available && !prominent ? "opacity-70" : "",
      )}
    >
      {episode.tmdbId ? (
        <button
          type="button"
          onClick={open}
          aria-label={`Open ${episode.show}`}
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-like focus-visible:outline-offset-[-2px]"
        />
      ) : null}

      <Poster
        src={episode.poster}
        alt={episode.show}
        size="w92"
        className={cn("pointer-events-none relative z-[1] shrink-0 rounded", prominent ? "w-[38px]" : "w-[30px]")}
      />

      <div className="pointer-events-none relative z-[1] flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="truncate text-[13.5px] font-semibold">{episode.show}</span>
        <span className="numeric shrink-0 text-[11px] font-medium text-ink-faint">
          {episodeCode(episode.season, episode.episode)}
        </span>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1.5">
        {available ? (
          episode.platforms.map((p) => (
            <ServiceBadge key={p.name} service={p} title={episode.show} iconOnly />
          ))
        ) : (
          /* Still listed, just marked. Hiding it read as a missing show. */
          <span
            className="rounded border border-dashed border-line-strong px-2 py-1 text-[10.5px] font-semibold text-ink-faint"
            title="TMDB has no listing for this in your region"
          >
            not in EG
          </span>
        )}

        {signedIn && episode.tmdbId ? (
          <button
            type="button"
            disabled={busy}
            onClick={toggle}
            aria-label={following ? "Following" : "Follow this show"}
            title={following ? "Following" : "Follow this show"}
            /* A 44px reach for the thumb, but only the star is painted. A
               filled green disc at that size outweighed the show it belonged
               to — the loudest thing in the row was the button. */
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full text-lg transition sm:size-8 sm:text-base",
              following
                ? "text-love"
                : "text-ink-faint hover:bg-white/5 hover:text-love",
              busy && "opacity-50",
            )}
          >
            {following ? "★" : "☆"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
