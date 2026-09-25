"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Ambient } from "./Ambient";
import { useEngine } from "./engine";
import { LivingRing } from "./LivingRing";
import { PeopleRow, type PersonChipData } from "./People";
import { PersonSheet } from "./PersonSheet";
import { Rail, RailItem } from "./Rail";
import { Tabs } from "./Tabs";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";
import type { CalendarEpisode, FreshEpisode } from "@/lib/queries";
import type { PersonNews } from "@/lib/people";
import type { MediaKind } from "@/db/schema";

/** Ask MOX's moods, before an AI model is connected. Same list as the app. */
const MOODS = [
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
type Mood = (typeof MOODS)[number][0];

type Ref = { tmdbId: number; kind: MediaKind };

/**
 * Home, as in the iPhone app: the ring and the question fill the first screen,
 * Ask MOX sits at the bottom of it, and the board is one scroll below.
 */
export function Home({
  today,
  hour,
  user,
  forYou,
  episodes,
  trending,
  fromPeople,
  inStore,
  needsServices,
}: {
  today: string;
  /** The hour in Cairo, from the server, so the greeting never flickers. */
  hour: number;
  user: { name: string; avatar: string | null } | null;
  forYou: FreshEpisode[];
  episodes: CalendarEpisode[];
  trending: CardTitle[];
  /** New work from the actors and directors you follow. */
  fromPeople: PersonNews[];
  inStore: CardTitle[];
  needsServices: boolean;
}) {
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [showMoods, setShowMoods] = useState(false);
  const [answer, setAnswer] = useState<{ key: string; items: CardTitle[]; people: PersonChipData[] } | null>(null);
  const [open, setOpen] = useState<Ref | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const ring = useRef<HTMLDivElement>(null);
  const engine = useEngine();
  // A larger ring on a large screen; the phone size everywhere else.
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);

  const q = query.trim();
  const asking = q.length >= 2 || mood !== null;
  const ringSize = asking ? 56 : wide ? 232 : 176;
  const key = mood ? `mood:${mood}` : `q:${q}`;
  const results = asking && answer?.key === key ? answer.items : null;
  const people = asking && answer?.key === key ? answer.people : [];
  const looking = asking && answer?.key !== key;

  useEffect(() => {
    if (!asking) return;
    const url = mood
      ? `/api/app/discover?mood=${mood}`
      : `/api/search?q=${encodeURIComponent(q)}`;
    const timer = setTimeout(
      async () => {
        try {
          const res = await fetch(url);
          const body = (await res.json()) as {
            results: CardTitle[];
            people?: { id: number; name: string; profile: string | null; department: string | null; knownFor: string[] }[];
          };
          setAnswer({
            key,
            items: body.results ?? [],
            people: (body.people ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              profile: p.profile,
              role: p.knownFor[0] ?? (p.department === "Directing" ? "Director" : null),
            })),
          });
        } catch {
          setAnswer({ key, items: [], people: [] });
        }
      },
      mood ? 0 : 300,
    );
    return () => clearTimeout(timer);
  }, [asking, key, mood, q]);

  const greeting =
    hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    /* Full-bleed and clipped at the screen's edges: the ring's light is wider
       than a phone, and left unclipped it made the browser widen the whole
       page — which pushed the glass bar off the bottom of the screen. Margins
       rather than a transform, so fixed-position children still mean the
       viewport. */
    <div className="relative mx-[calc(50%-50vw)] overflow-x-clip">
      {/* Home is black edge to edge, like the ring's own background. */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-black" />
      <Ambient ring={ring} ringSize={ringSize} height="calc(100svh + 12rem)" light={!asking} engine={engine} />
      {/* In the screen's corner, as in the app — not the content column's. */}
      <div className="absolute end-4 top-0 z-10 sm:end-6">
        <Avatar user={user} />
      </div>
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">

      {/* One hero for both states. The ask bar has to stay the same element
          while the layout around it changes, or the field loses focus — and
          the phone its keyboard — on the second letter typed. */}
      <section
        className={cn(
          "relative flex flex-col items-center",
          /* Not asking: a little under one screen tall, so the top of the board
             — the "New for you" heading and the edge of its first card — shows
             above the glass bar, the way the app lets it peek: the only sign
             that there is more below. The bar's fade (GlassBar) keeps what
             passes under it from looking cluttered. */
          asking
            ? "pb-6 pt-12"
            : "min-h-[calc(100svh-0.75rem-env(safe-area-inset-top)-11rem)] pt-12",
        )}
      >
        <div className={asking ? "" : "flex-1"} />

        <div ref={ring}>
          <LivingRing size={ringSize} />
        </div>

        {!asking ? (
          <div className="relative z-10 text-center">
            <h1 className="mt-3 text-[28px] font-medium tracking-tight lg:text-[36px]">{greeting}</h1>
            <p className="mt-2.5 text-[17px] text-ink/70 lg:text-[20px]">What are we watching tonight?</p>
          </div>
        ) : null}

        <div className={asking ? "h-3" : "flex-1"} />

        {showMoods || mood ? (
          <div className="strip relative z-10 -mx-4 mb-3 w-[calc(100%+2rem)] max-w-[680px] gap-2 px-4">
            {MOODS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMood(mood === id ? null : id);
                  setQuery("");
                }}
                className={cn(
                  "rounded-full px-3.5 py-2 text-[13px] font-medium transition",
                  mood === id ? "bg-love text-bg" : "bg-card/70 text-ink hover:bg-raised",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <AskBar
          query={query}
          onQuery={(v) => {
            setQuery(v);
            if (v) setMood(null);
          }}
          looking={looking}
          asking={asking}
          showMoods={showMoods}
          onToggleMoods={() => setShowMoods(!showMoods)}
          onClear={() => {
            setQuery("");
            setMood(null);
          }}
        />
      </section>

      {asking ? (
        <Answers
          mood={mood ? MOODS.find(([id]) => id === mood)![1] : null}
          query={q}
          results={results}
          people={people}
          onOpen={setOpen}
          onOpenPerson={setPerson}
        />
      ) : (
        <div className="relative z-10 mt-6">
          <Board
            today={today}
            signedIn={user !== null}
            needsServices={needsServices}
            forYou={forYou}
            episodes={episodes}
            trending={trending}
            fromPeople={fromPeople}
            inStore={inStore}
            onOpen={setOpen}
          />
        </div>
      )}

      </div>

      {open ? (
        <TitleSheet tmdbId={open.tmdbId} kind={open.kind} signedIn={user !== null} onClose={() => setOpen(null)} />
      ) : null}
      {person !== null ? <PersonSheet id={person} signedIn={user !== null} onClose={() => setPerson(null)} /> : null}
    </div>
  );
}

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
const subscribeWide = (change: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const isWide = () => window.matchMedia(WIDE).matches;
const speechSupported = () => {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};

/** "+" for moods, the question, and the mic — the mockup's bar. */
function AskBar({
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
        placeholder={listening ? "Listening…" : "Ask MOX anything…"}
        aria-label="Ask MOX"
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

function Avatar({ user }: { user: { name: string; avatar: string | null } | null }) {
  return (
    <Link
      href={user ? "/admin" : "/admin/login"}
      aria-label={user ? "Account and settings" : "Sign in"}
      className={cn(
        "grid size-10 place-items-center overflow-hidden rounded-full border-[1.5px] border-love/70 text-[17px] font-semibold transition hover:opacity-85",
        user ? "bg-love-soft text-bg" : "bg-card text-ink",
      )}
    >
      {user?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small, already-sized photo
        <img src={user.avatar} alt="" className="size-full object-cover" />
      ) : user ? (
        user.name.slice(0, 1).toUpperCase()
      ) : (
        <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
          <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.5-8 5.5V22h16v-2.5c0-3-3.6-5.5-8-5.5z" />
        </svg>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------- answers

function Answers({
  mood,
  query,
  results,
  people,
  onOpen,
  onOpenPerson,
}: {
  mood: string | null;
  query: string;
  results: CardTitle[] | null;
  people: PersonChipData[];
  onOpen: (r: Ref) => void;
  onOpenPerson: (id: number) => void;
}) {
  return (
    <div className="relative z-10 mx-auto max-w-[760px]">
      {/* Actors and directors first: a name is as good a way in as a title. */}
      {people.length ? (
        <div className="mb-5">
          <PeopleRow title="People" people={people} onOpen={(p) => onOpenPerson(p.id)} />
        </div>
      ) : null}
      {mood ? (
        <h2 className="mb-3 text-xl font-semibold">
          {mood} <span className="text-[13px] font-normal text-ink-dim">on your services</span>
        </h2>
      ) : null}
      {results && !results.length ? (
        <p className="text-[14px] text-ink-dim">
          {mood ? "Nothing in that mood on your services right now." : `Nothing found for “${query}”.`}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {(results ?? []).map((card) => (
          <li key={`${card.kind}-${card.tmdbId}`}>
            <ResultRow card={card} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One result: poster, title, where it streams. Same as the app's ResultRow. */
function ResultRow({ card, onOpen }: { card: CardTitle; onOpen: (r: Ref) => void }) {
  const meta = [card.year, card.kind === "tv" ? "Series" : "Film", card.rating ? `★ ${card.rating.toFixed(1)}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-start gap-3.5 rounded-card py-2 transition hover:bg-white/[0.03]">
      <button type="button" onClick={() => onOpen(card)} aria-label={`Open ${card.title}`} className="shrink-0">
        <Thumb src={card.poster} className="h-[93px] w-[62px] rounded-[10px]" />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(card)} className="text-start text-[16px] font-semibold leading-snug">
          {card.title}
        </button>
        <div className="numeric mt-1 text-[12px] text-ink-dim">{meta}</div>
        {card.platforms.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.platforms.map((p) => (
              <PlatformChip key={p.name} name={p.name} logo={p.logo} url={p.url} />
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-ink-faint">Not on your services</div>
        )}
      </div>
    </div>
  );
}

function PlatformChip({ name, logo, url }: { name: string; logo: string | null; url: string | null }) {
  const inner = (
    <>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB logo
        <img src={logo} alt="" className="size-4 rounded" />
      ) : null}
      <span className="truncate">{name}</span>
    </>
  );
  const cls = "flex items-center gap-1.5 rounded-full bg-card px-2 py-1 text-[11px] font-medium text-ink";
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className={cn(cls, "transition hover:bg-raised")}>
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized files
    <img src={src} alt="" loading="lazy" className={cn("bg-card object-cover", className)} />
  ) : (
    <div className={cn("bg-card", className)} />
  );
}

// ---------------------------------------------------------------- board

function Board({
  today,
  signedIn,
  needsServices,
  forYou,
  episodes,
  trending,
  fromPeople,
  inStore,
  onOpen,
}: {
  today: string;
  signedIn: boolean;
  needsServices: boolean;
  forYou: FreshEpisode[];
  episodes: CalendarEpisode[];
  trending: CardTitle[];
  fromPeople: PersonNews[];
  inStore: CardTitle[];
  onOpen: (r: Ref) => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      {needsServices ? (
        <Link
          href="/admin/services"
          className="flex items-center gap-3 rounded-card border border-love/30 bg-love/10 px-4 py-3 text-[13px] transition hover:border-love/60"
        >
          <span className="flex-1 leading-snug">
            <b className="font-semibold">Pick the services you pay for.</b>{" "}
            <span className="text-ink-dim">Until then everything shows, not just what you can watch.</span>
          </span>
          <span aria-hidden className="text-ink-dim">›</span>
        </Link>
      ) : null}

      <ForYou items={forYou} today={today} signedIn={signedIn} onOpen={onOpen} />

      {fromPeople.length ? (
        <Shelf
          title="From people you follow"
          cards={fromPeople.map((n) => ({ ...n.title, reason: `${n.person.name} · ${n.title.platforms[0]?.name ?? ""}` }))}
          onOpen={onOpen}
        />
      ) : null}
      <Airing episodes={episodes} today={today} signedIn={signedIn} onOpen={onOpen} />

      {trending.length ? (
        <Shelf title="Trending" detail="on your services" cards={trending} onOpen={onOpen} />
      ) : null}
      {inStore.length ? <Shelf title="New in the store" cards={inStore} onOpen={onOpen} /> : null}

      {/* Universes stay on the website only, for now. */}
      <Link
        href="/universes"
        className="flex items-center justify-between rounded-[20px] bg-surface px-5 py-4 transition hover:bg-card"
      >
        <span>
          <span className="block text-[16px] font-semibold">Universes</span>
          <span className="text-[13px] text-ink-dim">Franchises, in order, and what comes next</span>
        </span>
        <span aria-hidden className="text-xl text-ink-dim">›</span>
      </Link>
    </div>
  );
}

function Heading({ title, detail }: { title: string; detail?: string }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 text-[20px] font-semibold tracking-tight">
      {title}
      {detail ? <span className="text-[13px] font-normal text-ink-dim">{detail}</span> : null}
    </h2>
  );
}

function Shelf({
  title,
  detail,
  cards,
  onOpen,
}: {
  title: string;
  detail?: string;
  cards: CardTitle[];
  onOpen: (r: Ref) => void;
}) {
  return (
    <section>
      <Heading title={title} detail={detail} />
      <Rail>
        {cards.map((c) => (
          <RailItem key={`${c.kind}-${c.tmdbId}`}>
            <TitleCard item={c} onOpen={onOpen} />
          </RailItem>
        ))}
      </Rail>
    </section>
  );
}

/** New episodes of shows you follow from the last week, not yet watched. */
function ForYou({
  items,
  today,
  signedIn,
  onOpen,
}: {
  items: FreshEpisode[];
  today: string;
  signedIn: boolean;
  onOpen: (r: Ref) => void;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const shown = items.filter((i) => !ticked.has(`${i.tmdbId}:${i.season}:${i.episode}`));

  const watched = async (item: FreshEpisode) => {
    const id = `${item.tmdbId}:${item.season}:${item.episode}`;
    setTicked(new Set(ticked).add(id));
    await fetch("/api/watched", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId: item.tmdbId, season: item.season, episode: item.episode, watched: true }),
    }).catch(() => null);
    router.refresh();
  };

  return (
    <section>
      <Heading title="New for you" />
      {!signedIn ? (
        <div className="flex flex-col items-center gap-3 rounded-[20px] bg-surface px-6 py-6 text-center">
          <p className="text-[14px] text-ink-dim">Sign in to see the new episodes of shows you follow.</p>
          <Link href="/admin/login" className="rounded-full bg-love px-5 py-2 text-[14px] font-semibold text-bg">
            Sign in
          </Link>
        </div>
      ) : !shown.length ? (
        <p className="text-[14px] text-ink-dim">You’re caught up — nothing new from your shows since yesterday.</p>
      ) : (
        <div className="strip -me-4 snap-x gap-3 pe-4 sm:me-0 sm:pe-0">
          {shown.map((item) => (
            <FreshCard
              key={`${item.tmdbId}-${item.season}-${item.episode}`}
              item={item}
              today={today}
              single={shown.length === 1}
              onWatched={() => watched(item)}
              onOpen={() => onOpen(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FreshCard({
  item,
  today,
  single,
  onWatched,
  onOpen,
}: {
  item: FreshEpisode;
  today: string;
  single: boolean;
  onWatched: () => void;
  onOpen: () => void;
}) {
  const where = item.platforms[0];
  return (
    <article
      className={cn(
        "relative h-[230px] snap-start overflow-hidden rounded-[24px] bg-surface",
        single ? "w-full sm:w-[560px]" : "w-[calc(100vw-4.5rem)] sm:w-[520px]",
      )}
    >
      <Thumb src={item.backdrop ?? item.poster} className="absolute inset-0 size-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/35 to-black/90" />
      <div className="absolute inset-x-0 bottom-0 p-[18px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-love-soft">
          New episode · {dayLabel(item.date, today)}
        </div>
        <h3 className="mt-1 truncate text-[24px] font-bold text-white">{item.title}</h3>
        <div className="numeric text-[13px] text-white/75">
          {/* Spelled out, so the card reads as one episode rather than the whole show. */}
          {[`Season ${item.season}`, `Episode ${item.episode}`, where?.name].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          {where?.url ? (
            <a
              href={where.url}
              target="_blank"
              rel="noreferrer"
              className="flex h-[42px] items-center gap-2 rounded-full bg-ink px-[22px] text-[15px] font-semibold text-bg transition hover:opacity-90"
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                <path d="M7 4v16l13-8z" />
              </svg>
              Play
            </a>
          ) : (
            <button
              type="button"
              onClick={onOpen}
              className="flex h-[42px] items-center gap-2 rounded-full bg-ink px-[22px] text-[15px] font-semibold text-bg"
            >
              Details
            </button>
          )}
          <GlassCircle onClick={onWatched} label={`Mark ${item.episodeLabel ?? "episode"} watched`}>
            <path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z" className="fill-love" />
          </GlassCircle>
          <GlassCircle onClick={onOpen} label="Details">
            <path d="M11 10h2v8h-2zm0-4h2v2h-2z" />
          </GlassCircle>
        </div>
      </div>
    </article>
  );
}

function GlassCircle({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-[42px] place-items-center rounded-full border border-white/15 bg-white/10 text-ink backdrop-blur-xl transition hover:bg-white/20"
    >
      <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

const AIRING_TABS = [
  ["mine", "Your shows"],
  ["available", "On services"],
  ["all", "All"],
] as const;

/** The TV calendar, a week at a time. */
function Airing({
  episodes,
  today,
  signedIn,
  onOpen,
}: {
  episodes: CalendarEpisode[];
  today: string;
  signedIn: boolean;
  onOpen: (r: Ref) => void;
}) {
  const [filter, setFilter] = useState<string>(signedIn ? "mine" : "all");
  const shown = episodes.filter((e) =>
    filter === "mine" ? e.following : filter === "available" ? e.platforms.length > 0 : true,
  );
  const days = new Map<string, CalendarEpisode[]>();
  for (const e of shown) days.set(e.airs, [...(days.get(e.airs) ?? []), e]);
  const week = [...days].slice(0, 7);

  return (
    <section>
      <Heading title="Airing" detail="next two weeks" />
      <Tabs className="mb-4 sm:max-w-md" value={filter} onChange={setFilter} options={AIRING_TABS.map(([id, l]) => [id, l])} />
      {!week.length ? (
        <p className="text-[14px] text-ink-dim">
          {filter === "mine" ? "None of the shows you follow air in the next two weeks." : "Nothing on the calendar."}
        </p>
      ) : null}
      <div className="flex flex-col gap-5">
        {week.map(([day, list]) => (
          <div key={day}>
            <div className={cn("mb-2 text-[13px] font-semibold", day === today ? "text-love" : "text-ink-dim")}>
              {dayLabel(day, today)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((ep) => (
                <button
                  key={`${ep.show}-${ep.season}-${ep.episode}`}
                  type="button"
                  onClick={() => ep.tmdbId && onOpen({ tmdbId: ep.tmdbId, kind: "tv" })}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 text-start transition hover:bg-card"
                >
                  <Thumb src={ep.poster} className="h-[60px] w-10 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{ep.show}</span>
                    <span className="numeric block text-[12px] text-ink-dim">
                      {[`S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`, ep.platforms[0]?.name]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {ep.following ? (
                    <svg viewBox="0 0 24 24" className="me-1 size-4 fill-love" aria-label="Following">
                      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" />
                    </svg>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
