"use client";

import { MoxPulse } from "./Loading";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { LivingRing } from "./LivingRing";
import { cn } from "@/lib/cn";

/** Ask MOX's moods, before an AI model is connected. Same list as the app. */
export const MOODS = [
  ["comedy", "Something funny"],
  ["action", "Action"],
  ["drama", "Drama"],
  ["thriller", "Thriller"],
  ["scifi", "Sci‑fi"],
  ["horror", "Horror"],
  ["romance", "Romance"],
  ["animation", "Animation"],
  ["crime", "Crime"],
  ["documentary", "Documentary"],
] as const;
export type Mood = (typeof MOODS)[number][0];

// ---------------------------------------------------------------- ask bar


const WIDE = "(min-width: 1024px)";
export const subscribeWide = (change: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
export const isWide = () => window.matchMedia(WIDE).matches;

/**
 * "+" for moods, the question, and — for the owner — the ring that opens MOX.
 * The ring took the microphone's place: dictation never worked reliably in
 * the browsers people use, and the keyboard's own mic does it better.
 */
export function AskBar({
  query,
  onQuery,
  looking,
  asking,
  showMoods,
  onToggleMoods,
  onClear,
  mox = false,
}: {
  query: string;
  onQuery: (v: string) => void;
  looking: boolean;
  asking: boolean;
  showMoods: boolean;
  onToggleMoods: () => void;
  onClear: () => void;
  /** The owner, who has MOX to talk to. */
  mox?: boolean;
}) {
  return (
    <div className="relative z-10 flex h-14 w-full max-w-[640px] items-center lg:h-16 lg:max-w-[720px] lg:px-2.5 gap-2.5 rounded-full border border-white/10 bg-white/[0.06] px-2 shadow-pop">
      <button
        type="button"
        onClick={onToggleMoods}
        aria-label={showMoods ? "Hide moods" : "Pick a mood"}
        className="grid size-[38px] shrink-0 place-items-center rounded-full bg-ink/10 text-ink transition hover:bg-ink/15"
      >
        <svg viewBox="0 0 24 24" className={cn("size-[18px] fill-current transition-transform", showMoods && "rotate-45")} aria-hidden>
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
        </svg>
      </button>

      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Films, series, people…"
        aria-label="Search"
        enterKeyHint="search"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-dim lg:text-[17px]"
      />

      {looking ? (
        <MoxPulse size={20} label="Searching" />
      ) : asking ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-dim/60 text-[13px] leading-none text-bg"
        >
          ×
        </button>
      ) : null}

      {mox ? (
        <Link
          href="/mox"
          aria-label="Talk to MOX"
          className="grid size-[38px] shrink-0 place-items-center rounded-full bg-ink/10 transition hover:bg-ink/15"
        >
          {/* The ring as a picture, not the live canvas: the bar stays light. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset */}
          <img src="/ring-tab.png" alt="" className="size-6" draggable={false} />
        </Link>
      ) : (
        <span className="w-1" />
      )}
    </div>
  );
}


// ---------------------------------------------------------------- hero

/**
 * The full-screen hero home used to open with: the ring, a greeting, and Ask
 * MOX at the bottom of the first screen. Home no longer leads with it — the
 * first screen is for what is new — but the design is kept here, whole, for
 * the places that want it.
 */
export function AskHero({
  greeting,
  query,
  onQuery,
  mood,
  onMood,
  looking,
}: {
  greeting: string;
  query: string;
  onQuery: (v: string) => void;
  mood: Mood | null;
  onMood: (m: Mood | null) => void;
  looking: boolean;
}) {
  const [showMoods, setShowMoods] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const asking = query.trim().length >= 2 || mood !== null;
  return (
    <section
      className={cn(
        "relative flex flex-col items-center",
        asking ? "pb-6 pt-12" : "min-h-[calc(100svh-0.75rem-env(safe-area-inset-top)-11rem)] pt-12",
      )}
    >
      <div className={asking ? "" : "flex-1"} />
      <LivingRing size={asking ? 56 : wide ? 232 : 176} />
      {!asking ? (
        <div className="relative z-10 text-center">
          <h1 className="mt-3 text-[28px] font-medium tracking-tight lg:text-[36px]">{greeting}</h1>
          <p className="mt-2.5 text-[17px] text-ink/70 lg:text-[20px]">What are we watching tonight?</p>
        </div>
      ) : null}
      <div className={asking ? "h-3" : "flex-1"} />
      {showMoods || mood ? <MoodChips mood={mood} onMood={onMood} className="mb-3" /> : null}
      <AskBar
        query={query}
        onQuery={onQuery}
        looking={looking}
        asking={asking}
        showMoods={showMoods}
        onToggleMoods={() => setShowMoods(!showMoods)}
        onClear={() => {
          onQuery("");
          onMood(null);
        }}
      />
    </section>
  );
}

export function MoodChips({ mood, onMood, className }: { mood: Mood | null; onMood: (m: Mood | null) => void; className?: string }) {
  return (
    <div className={cn("strip relative z-10 -mx-4 w-[calc(100%+2rem)] max-w-[720px] gap-2 px-4", className)}>
      {MOODS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onMood(mood === id ? null : id)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition",
            mood === id ? "bg-love text-bg" : "bg-card/70 text-ink hover:bg-raised",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
