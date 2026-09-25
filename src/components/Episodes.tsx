"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type EpisodeData = {
  season: number;
  episode: number;
  name: string | null;
  airs: string | null;
  out: boolean;
  watched: boolean;
};

export type ProgressData = {
  season: number;
  seasonName: string;
  seasonCount: number;
  totalEpisodes: number;
  aired: number;
  watched: number;
  episodes: EpisodeData[];
  next: { season: number; episode: number; airs: string | null } | null;
};

const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
/** "Wed 30 Sep" for a calendar date. */
export const shortDate = (iso: string) => day.format(new Date(`${iso}T12:00:00Z`));

/**
 * Where you are in a series: a bar of watched, out and still to come, one line
 * saying it in words, and the current season episode by episode with a tick
 * for each you have seen.
 */
export function Episodes({
  tmdbId,
  progress,
  signedIn,
}: {
  tmdbId: number;
  progress: ProgressData;
  signedIn: boolean;
}) {
  const [episodes, setEpisodes] = useState(progress.episodes);
  const [watched, setWatched] = useState(progress.watched);

  const toggle = async (e: EpisodeData) => {
    const next = !e.watched;
    setEpisodes((all) => all.map((x) => (x.episode === e.episode ? { ...x, watched: next } : x)));
    setWatched((n) => n + (next ? 1 : -1));
    const res = await fetch("/api/watched", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId, season: e.season, episode: e.episode, watched: next }),
    });
    if (!res.ok) {
      setEpisodes((all) => all.map((x) => (x.episode === e.episode ? { ...x, watched: !next } : x)));
      setWatched((n) => n + (next ? -1 : 1));
    }
  };

  const total = Math.max(progress.totalEpisodes, 1);
  const summary =
    progress.aired === 0
      ? [
          progress.next?.airs ? `Starts ${shortDate(progress.next.airs)}` : "Not started yet",
          `${progress.totalEpisodes} episode${progress.totalEpisodes === 1 ? "" : "s"}`,
        ]
      : [
          `${progress.aired} of ${progress.totalEpisodes} out`,
          signedIn ? `you've watched ${watched}` : null,
          progress.next?.airs ? `next ${shortDate(progress.next.airs)}` : progress.aired >= progress.totalEpisodes ? "all out" : null,
        ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[18px] font-semibold tracking-tight">Episodes</h3>
        <span className="text-[12.5px] text-ink-dim">
          {progress.seasonCount > 1 ? progress.seasonName : null}
        </span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
        <div className="bg-love" style={{ width: `${(Math.min(watched, progress.aired) / total) * 100}%` }} />
        <div className="bg-white/25" style={{ width: `${(Math.max(progress.aired - watched, 0) / total) * 100}%` }} />
      </div>
      <p className="text-[13.5px] text-ink-dim">{summary.filter(Boolean).join(" · ")}</p>

      <ol className="overflow-hidden rounded-[16px] bg-surface">
        {episodes.map((e) => (
          <li key={e.episode} className={cn("flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-0", !e.out && "opacity-50")}>
            <span className="numeric w-8 shrink-0 text-[12.5px] text-ink-faint">E{e.episode}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{e.name ?? `Episode ${e.episode}`}</span>
              <span className="block text-[12px] text-ink-faint">{e.airs ? shortDate(e.airs) : "Date to be announced"}</span>
            </span>
            {e.out && signedIn ? (
              <button
                type="button"
                onClick={() => toggle(e)}
                aria-pressed={e.watched}
                aria-label={e.watched ? `Mark episode ${e.episode} unwatched` : `Mark episode ${e.episode} watched`}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border transition",
                  e.watched ? "border-love bg-love text-bg" : "border-line-strong text-ink-faint hover:text-ink",
                )}
              >
                <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth={2.6} aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
