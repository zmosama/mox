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
  seasons?: { season: number; name: string; episodes: number }[];
  totalEpisodes: number;
  aired: number;
  watched: number;
  episodes: EpisodeData[];
  next: { season: number; episode: number; airs: string | null } | null;
  /** Where this season streams, when it names its own service. */
  services?: string[] | null;
};

const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
/** "Wed 30 Sep" for a calendar date. */
export const shortDate = (iso: string) => day.format(new Date(`${iso}T12:00:00Z`));

/**
 * Where you are in a season: a bar of watched, out and still to come, one line
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
  const [season, setSeason] = useState(progress.season);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState(progress.services ?? null);

  /* Another season's episodes. The bar and the summary stay about the whole
     show; only the list below changes. */
  const pick = async (n: number) => {
    setSeason(n);
    setLoading(true);
    try {
      const res = await fetch(`/api/title/tv/${tmdbId}/season/${n}`);
      if (res.ok) {
        const picked = (await res.json()) as ProgressData;
        setEpisodes(picked.episodes);
        setServices(picked.services ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (e: EpisodeData) => {
    const next = !e.watched;
    setEpisodes((all) => all.map((x) => (x.episode === e.episode ? { ...x, watched: next } : x)));
    const res = await fetch("/api/watched", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId, season: e.season, episode: e.episode, watched: next }),
    });
    if (!res.ok) {
      setEpisodes((all) => all.map((x) => (x.episode === e.episode ? { ...x, watched: !next } : x)));
    }
  };

  /* The bar and the line are about the season on show, counted from its
     own episodes, so they change with the pick. */
  const count = episodes.length;
  const out = episodes.filter((e) => e.out).length;
  const seen = episodes.filter((e) => e.watched).length;
  const upcoming = episodes.find((e) => !e.out);
  const total = Math.max(count, 1);
  const summary =
    out === 0
      ? [
          upcoming?.airs ? `Starts ${shortDate(upcoming.airs)}` : "Not started yet",
          `${count} episode${count === 1 ? "" : "s"}`,
        ]
      : [
          out >= count ? `All ${count} out` : `${out} of ${count} out`,
          signedIn ? `you've watched ${seen}` : null,
          upcoming?.airs ? `next ${shortDate(upcoming.airs)}` : null,
        ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[18px] font-semibold tracking-tight">Episodes</h3>
        {progress.seasons && progress.seasons.length > 1 ? (
          <select
            aria-label="Season"
            value={season}
            onChange={(e) => pick(Number(e.target.value))}
            className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink outline-none"
          >
            {progress.seasons.map((s) => (
              <option key={s.season} value={s.season}>
                {s.name} · {s.episodes} ep
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
        <div className="bg-love" style={{ width: `${(Math.min(seen, out) / total) * 100}%` }} />
        <div className="bg-white/25" style={{ width: `${(Math.max(out - seen, 0) / total) * 100}%` }} />
      </div>
      <p className="text-[13.5px] text-ink-dim">
        {summary.filter(Boolean).join(" · ")}
        {/* The season's own service, which is not always the show's. */}
        {services?.length ? <span className="text-love-soft"> · on {services.join(", ")}</span> : null}
      </p>

      <ol className={cn("overflow-hidden rounded-[16px] bg-surface transition-opacity", loading && "opacity-50")}>
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
