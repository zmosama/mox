"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const noSubscribe = () => () => {};
const WIDE = "(min-width: 1024px)";
export const subscribeWide = (change: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
export const isWide = () => window.matchMedia(WIDE).matches;
const speechSupported = () => {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};

/** "+" for moods, the question, and the mic — the mockup's bar. */
export function AskBar({
  query,
  onQuery,
  looking,
  asking,
  showMoods,
  onToggleMoods,
  onClear,
}: {
  query: string;
  onQuery: (v: string) => void;
  looking: boolean;
  asking: boolean;
  showMoods: boolean;
  onToggleMoods: () => void;
  onClear: () => void;
}) {
  const [listening, setListening] = useState(false);
  // False on the server and in the first render; a mic the browser cannot
  // use is worse than none.
  const canListen = useSyncExternalStore(noSubscribe, speechSupported, () => false);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => recognition.current?.stop(), []);

  const toggleMic = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0].transcript).join("");
      onQuery(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="relative z-10 flex h-14 w-full max-w-[640px] items-center lg:h-16 lg:max-w-[720px] lg:px-2.5 gap-2.5 rounded-full border border-white/10 bg-white/[0.06] px-2 shadow-pop backdrop-blur-2xl">
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
        placeholder={listening ? "Listening…" : "Films, series, people…"}
        aria-label="Search"
        enterKeyHint="search"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-dim lg:text-[17px]"
      />

      {looking ? (
        <span aria-label="Searching" className="size-4 shrink-0 animate-spin rounded-full border-2 border-ink-dim border-t-transparent" />
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

      {canListen ? (
        <button
          type="button"
          onClick={toggleMic}
          aria-label={listening ? "Stop listening" : "Speak"}
          className={cn(
            "grid size-[38px] shrink-0 place-items-center rounded-full transition",
            listening ? "animate-pulse bg-love/30 text-love" : "bg-ink/10 text-ink hover:bg-ink/15",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" />
          </svg>
        </button>
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
