"use client";

import type { Explore } from "@/lib/explore";
import { MoxPulse } from "./Loading";
import Link from "next/link";
import { WEB_TABS } from "./GlassBar";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AskBar, MOODS, MoodChips, type Mood } from "./AskBar";
import { PeopleRow, type PersonChipData } from "./People";
import { FriendsLine } from "./Friends";
import { usePaged } from "./usePaged";
import { PersonSheet } from "./PersonSheet";
import { Rail, RailItem } from "./Rail";
import { Tabs } from "./Tabs";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import { cn } from "@/lib/cn";
import { addDaysISO, dayLabel } from "@/lib/dates";
import type { CalendarEpisode, FreshEpisode } from "@/lib/queries";
import type { PersonNews } from "@/lib/people";
import type { MediaKind } from "@/db/schema";
import { localImage } from "@/lib/images";
import { forgetTitles } from "./titleCache";

type Ref = { tmdbId: number; kind: MediaKind };
type SearchPerson = { id: number; name: string; profile: string | null; department: string | null; knownFor: string[] };

type Spot = CardTitle & { backdrop: string | null; overview: string | null };

/**
 * Home: where you find out what is new before anybody tells you.
 *
 * It used to open on the ring and a question, a whole screen with nothing to
 * watch in it — search first, as if you already knew what you were looking
 * for. Now Ask MOX is a bar along the top and the first screen is the news:
 * what everybody is watching this week, what just landed on your services,
 * and what is coming. (The full-screen hero is kept as AskHero.)
 */
export function Home({
  today,
  user,
  forYou,
  episodes,
  trending,
  fresh,
  coming,
  picks,
  fromPeople,
  needsServices,
  explore,
}: {
  /** A true line and a picture for each screen in "Explore". */
  explore: Explore;
  today: string;
  /** `mox`: this is the owner, who has MOX to talk to. */
  user: { name: string; avatar: string | null; mox?: boolean } | null;
  forYou: FreshEpisode[];
  episodes: CalendarEpisode[];
  trending: Spot[];
  /** New on your services this month, most watched first. */
  fresh: CardTitle[];
  coming: CardTitle[];
  /** What your ratings recommend, with why. */
  picks: CardTitle[];
  /** New work from the actors and directors you follow. */
  fromPeople: PersonNews[];
  needsServices: boolean;
}) {
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [showMoods, setShowMoods] = useState(false);
  const [moodAnswer, setMoodAnswer] = useState<{ mood: Mood; items: CardTitle[] } | null>(null);
  const [searched, setSearched] = useState("");
  const [open, setOpen] = useState<Ref | null>(null);
  const [person, setPerson] = useState<number | null>(null);

  // The biggest titles of the week lead, with their pictures; the rest of the
  // week's list follows as a rail.
  const spots = trending.filter((t) => t.backdrop).slice(0, 6);
  const restTrending = trending.filter((t) => !spots.includes(t));

  const q = query.trim();
  const asking = q.length >= 2 || mood !== null;

  // Asked for once typing pauses, not on every letter.
  useEffect(() => {
    // A short pause between keystrokes: answers come from our own index.
    const timer = setTimeout(() => setSearched(q.length >= 2 && !mood ? q : ""), 150);
    return () => clearTimeout(timer);
  }, [q, mood]);

  /* Ten at a time, and the next ten when the list is scrolled to its end:
     a broad word like "disney" used to fetch and check everything at once. */
  const { sentinel: searchEnd, ...search } = usePaged<CardTitle, PersonChipData[]>(
    searched ? `/api/search?q=${encodeURIComponent(searched)}` : null,
    (body) => ({
      items: (body.results as CardTitle[]) ?? [],
      next: (body.next as number | null) ?? null,
      extra: ((body.people as SearchPerson[] | undefined) ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        profile: p.profile,
        role: p.knownFor[0] ?? (p.department === "Directing" ? "Director" : null),
      })),
    }),
  );

  useEffect(() => {
    if (!mood) return;
    let live = true;
    (async () => {
      try {
        const body = (await (await fetch(`/api/app/discover?mood=${mood}`)).json()) as { results: CardTitle[] };
        if (live) setMoodAnswer({ mood, items: body.results ?? [] });
      } catch {
        if (live) setMoodAnswer({ mood, items: [] });
      }
    })();
    return () => {
      live = false;
    };
  }, [mood]);

  const results = mood
    ? moodAnswer?.mood === mood ? moodAnswer.items : null
    : searched === q && !search.pending ? search.items : null;
  const people = !mood && searched === q ? (search.extra ?? []) : [];
  const looking = asking && results === null;

  return (
    /* Full-bleed and clipped at the screen's edges: the ring's light is wider
       than a phone, and left unclipped it made the browser widen the whole
       page. Margins rather than a transform, so fixed-position children still
       mean the viewport. */
    <div className="relative mx-[calc(50%-50vw)] overflow-x-clip">
      <div aria-hidden className="fixed inset-0 -z-10 bg-black" />
      {/* A phone gets the phone app's layout; a computer the iPad's — the
          featured picture across the whole width, wide cards, and only the
          floating dock to move around. */}
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:max-w-none lg:px-10">
        {/* The week's big picture first and Ask MOX under it; while asking,
            the picture steps aside and the bar rises to the top. Only the
            picture comes and goes, so the field never loses focus. */}
        {!asking && spots.length ? (
          <div className="relative z-10 pt-4 sm:pt-6">
            <Spotlight spots={spots} signedIn={user !== null} onOpen={setOpen} />
            {/* Your photo in the top corner, over the picture — on a phone.
                A computer has it beside the bar at the top (GlassBar). */}
            <div className="absolute end-3 top-7 z-20 sm:end-4 sm:top-10 lg:hidden">
              <Avatar user={user} />
            </div>
          </div>
        ) : null}
        <header className={cn("relative z-30 flex items-center gap-3 pb-4 sm:gap-4", asking || !spots.length ? "pt-4 sm:pt-6" : "pt-6")}>
          <div className="flex min-w-0 flex-1 justify-center">
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
              mox={user?.mox}
            />
          </div>
          {asking || !spots.length ? <span className="lg:hidden"><Avatar user={user} /></span> : null}
        </header>
        {showMoods || mood ? (
          <MoodChips
            mood={mood}
            onMood={(m) => {
              setMood(m);
              setQuery("");
            }}
            className="mx-auto mb-4"
          />
        ) : null}

        {asking ? (
          <Answers
            mood={mood ? MOODS.find(([id]) => id === mood)![1] : null}
            query={q}
            results={results}
            people={people}
            more={!mood && search.more}
            sentinel={mood ? null : searchEnd}
            onOpen={setOpen}
            onOpenPerson={setPerson}
          />
        ) : (
          <div className="relative z-10 mt-2 lg:mt-0">
            <Board
              today={today}
              signedIn={user !== null}
              needsServices={needsServices}
              forYou={forYou}
              episodes={episodes}
              trending={restTrending}
              fresh={fresh}
              coming={coming}
              picks={picks}
              fromPeople={fromPeople}
              explore={explore}
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
  more,
  sentinel,
  onOpen,
  onOpenPerson,
}: {
  mood: string | null;
  query: string;
  results: CardTitle[] | null;
  people: PersonChipData[];
  more: boolean;
  sentinel: ((el: HTMLDivElement | null) => void) | null;
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
      {sentinel ? <div ref={sentinel} aria-hidden className="h-px" /> : null}
      {more ? (
        <div className="flex justify-center py-6">
          <MoxPulse label="Loading more" />
        </div>
      ) : null}
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
        <FriendsLine friends={card.friends} className="mt-2" />
      </div>
    </div>
  );
}

function PlatformChip({ name, logo, url }: { name: string; logo: string | null; url: string | null }) {
  const inner = (
    <>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB logo
        <img src={localImage(logo)} alt="" className="size-4 rounded" />
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

/** `eager` for the one picture on screen at load: lazy, it arrived after the page did. */
function Thumb({ src, className, eager, wide }: { src: string | null; className?: string; eager?: boolean; wide?: boolean }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized files
    <img
      src={localImage(src)}
      /* The browser picks by how many real pixels the picture covers. A
         phone draws it about 400px wide: w780 is enough there and a fifth of
         w1280's bytes. A computer with a sharp screen covers two thousand or
         more, where w1280 was visibly soft — so it gets the 1920 or 2560 we
         make from TMDB's original (MADE_SIZES). */
      srcSet={wide ? [780, 1280, 1920, 2560].map((w) => `${localImage(src.replace(/\/w\d+\//, `/w${w}/`))} ${w}w`).join(", ") : undefined}
      sizes={wide ? "(min-width: 1024px) 70vw, 100vw" : undefined}
      alt=""
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      className={cn("bg-card object-cover", className)}
    />
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
  fresh,
  coming,
  picks,
  fromPeople,
  explore,
  onOpen,
}: {
  explore: Explore;
  today: string;
  signedIn: boolean;
  needsServices: boolean;
  forYou: FreshEpisode[];
  episodes: CalendarEpisode[];
  trending: Spot[];
  fresh: CardTitle[];
  coming: CardTitle[];
  picks: CardTitle[];
  fromPeople: PersonNews[];
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

      {fresh.length ? (
        <Shelf title="Just landed" detail="on your services" more="/new" cards={fresh} onOpen={onOpen} />
      ) : null}

      {/* The point of MOX: what to watch, from what you have rated. */}
      {picks.length ? (
        <Shelf title="Picked for you" detail="from your ratings" cards={picks} onOpen={onOpen} />
      ) : null}

      {forYou.length || !signedIn ? <ForYou items={forYou} today={today} signedIn={signedIn} onOpen={onOpen} /> : null}

      {trending.length ? (
        <Shelf title="Everyone's watching" detail="this week" cards={trending} onOpen={onOpen} />
      ) : null}

      {coming.length ? (
        <Shelf title="Coming soon" detail="most anticipated" more="/new" cards={coming} onOpen={onOpen} />
      ) : null}

      {fromPeople.length ? (
        <Shelf
          title="From people you follow"
          cards={fromPeople.map((n) => ({ ...n.title, reason: `${n.person.name} · ${n.title.platforms[0]?.name ?? ""}` }))}
          onOpen={onOpen}
        />
      ) : null}
      {/* Before Airing: signed out, Airing is a long table to scroll past. */}
      <Sections explore={explore} />

      <Airing episodes={episodes} today={today} signedIn={signedIn} onOpen={onOpen} />
    </div>
  );
}

/**
 * The week's biggest titles, one screen-wide picture at a time: swiped on a
 * phone, arrows and dots on a computer, and on to the next by itself every
 * few seconds until you touch it.
 */
const noSubscribe = () => () => {};

function Spotlight({ spots, signedIn, onOpen }: { spots: Spot[]; signedIn: boolean; onOpen: (r: Ref) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const n = spots.length;
  /* It goes round in both directions: the slides are laid out three times
     over, the middle set is the one shown, and whenever scrolling comes to
     rest in the first or last set it is moved, unseen, to the same slide in
     the middle. So the first slide has the last one on its left, never a
     gap. `at` counts across all three sets. */
  /* Until the page has woken up there is one set only, so the server's HTML
     already shows the first slide where the strip starts. The three sets
     arrive with the first render in the browser, and the jump to the middle
     one lands on the same picture, already drawn: before, the picture was
     drawn twice — once from the HTML, once after the jump, seconds later on a
     slow phone — and the second was what the page's load time counted. */
  const awake = useSyncExternalStore(noSubscribe, () => true, () => false);
  const looped = n > 1 && awake ? [...spots, ...spots, ...spots] : spots;
  const home = n > 1 && awake ? n : 0;
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const settle = useRef<number | undefined>(undefined);

  const centre = useCallback((i: number, behavior: ScrollBehavior) => {
    const el = strip.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.clientWidth) / 2, behavior });
  }, []);
  const go = useCallback((i: number) => centre(i, "smooth"), [centre]);

  // Start on the first slide of the middle set, once there is one.
  useEffect(() => {
    // The scroll this makes sets `at` (onScroll), so the dots follow.
    centre(home, "instant");
  }, [centre, home]);

  // A resized window keeps its old offset, which left the picture stopped
  // between two slides: put it back on the current one — only when the
  // width really changes, not mid-swipe.
  const atRef = useRef(at);
  useEffect(() => {
    atRef.current = at;
  }, [at]);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let width = el.clientWidth;
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      centre(atRef.current, "instant");
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [centre]);

  useEffect(() => {
    if (held || n < 2) return;
    const timer = setTimeout(() => go(at + 1), 7000);
    return () => clearTimeout(timer);
  }, [at, held, go, n]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Big this week"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onTouchStart={() => setHeld(true)}
      // Edge to edge: out of the page's side margins.
      className="-mx-4 sm:-mx-6 lg:-mx-10"
    >
      <div className="relative">
        <div
          ref={strip}
          onScroll={(e) => {
            const el = e.currentTarget;
            const mid = el.scrollLeft + el.clientWidth / 2;
            let best = 0;
            [...el.children].forEach((c, i) => {
              const s = c as HTMLElement;
              const top = el.children[best] as HTMLElement;
              if (Math.abs(s.offsetLeft + s.clientWidth / 2 - mid) < Math.abs(top.offsetLeft + top.clientWidth / 2 - mid)) best = i;
            });
            setAt(best);
            // Once it comes to rest outside the middle set, back into it.
            window.clearTimeout(settle.current);
            settle.current = window.setTimeout(() => {
              if (n > 1 && (best < n || best >= 2 * n)) {
                const same = (best % n) + n;
                centre(same, "instant");
                setAt(same);
              }
            }, 140);
          }}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] lg:gap-4 [&::-webkit-scrollbar]:hidden"
        >
          {looped.map((t, i) => (
            <SpotSlide
              key={`${t.kind}-${t.tmdbId}-${i}`}
              spot={t}
              rank={(i % n) + 1}
              // By the picture, not the copy: moving back to the middle set
              // swaps copies, and comparing copies made it dim and relight.
              current={i % n === at % n}
              // The slide on screen at load: slide 0 in the HTML, its middle-set copy after.
              first={i === home}
              signedIn={signedIn}
              onOpen={onOpen}
            />
          ))}
        </div>
        {n > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => go(at - 1)}
              className="absolute start-4 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/60 text-xl text-ink transition hover:bg-black/80 lg:grid"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => go(at + 1)}
              className="absolute end-4 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/60 text-xl text-ink transition hover:bg-black/80 lg:grid"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5">
          {spots.map((t, i) => (
            <button
              key={t.tmdbId}
              type="button"
              aria-label={`Show ${t.title}`}
              onClick={() => go(n + i)}
              className={cn("h-1.5 rounded-full transition-all", i === at % n ? "w-5 bg-ink" : "w-1.5 bg-ink/40")}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** TMDB's larger picture for the same file: w780 was blurry stretched across a screen. */
const sharp = (url: string | null) => url?.replace(/\/w\d+\//, "/w1280/") ?? null;

/**
 * One title of the week. The picture is never cropped: it keeps its own
 * shape. On a phone the words sit under it; on a computer over its lower
 * left, and the slide is only as wide as keeps the picture whole on screen.
 */
function SpotSlide({ spot, rank, current, first, signedIn, onOpen }: { spot: Spot; rank: number; current: boolean; first: boolean; signedIn: boolean; onOpen: (r: Ref) => void }) {
  const where = spot.platforms[0];
  return (
    <article
      // Anywhere on it opens the title; Play, Save and Details stop here.
      onClick={() => onOpen(spot)}
      className={cn(
        "relative w-[calc(100%-2.5rem)] shrink-0 cursor-pointer snap-center overflow-hidden rounded-[24px] bg-surface transition-opacity duration-500 lg:w-[min(calc(100%-8rem),calc(70svh*16/9))] lg:rounded-[28px]",
        // The ones either side, waiting their turn, stay in the background.
        !current && "opacity-40",
      )}
    >
      <div className="relative aspect-video">
        <Thumb src={sharp(spot.backdrop)} eager={first} wide className="absolute inset-0 size-full" />
        {/* Into the card below on a phone; under the words on a computer. */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface to-transparent lg:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-t from-black/90 via-black/30 to-transparent lg:block" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/70 via-transparent to-transparent lg:block" />
      </div>
      <div className="p-5 pt-2 lg:absolute lg:inset-x-0 lg:bottom-0 lg:max-w-[680px] lg:p-10 lg:pb-12">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-love-soft">
          #{rank} this week{where ? ` · ${where.name}` : ""}
        </div>
        <h2 className="mt-1.5 line-clamp-2 text-[26px] font-bold leading-tight text-white sm:text-[34px] lg:text-[48px]">{spot.title}</h2>
        <div className="numeric mt-1 text-[13px] text-white/75">
          {[spot.year, spot.kind === "tv" ? "Series" : "Film", spot.rating ? `★ ${spot.rating.toFixed(1)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {spot.overview ? (
          <p className="mt-2 line-clamp-2 text-[14px] leading-snug text-white/80 lg:line-clamp-3 lg:text-[15px]">{spot.overview}</p>
        ) : null}
        <div className="mt-4 flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
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
          ) : null}
          <button
            type="button"
            onClick={() => onOpen(spot)}
            className={cn(
              "flex h-[42px] items-center rounded-full px-[22px] text-[15px] font-semibold transition",
              where?.url ? "border border-white/15 bg-black/45 text-ink hover:bg-black/65" : "bg-ink text-bg hover:opacity-90",
            )}
          >
            Details
          </button>
          {signedIn ? <SaveButton item={spot} large /> : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Save for later in one tap, without opening the title — on the big
 * pictures only; the small cards carry nothing. A saved title is
 * followed, so its arrival on a service turns up in New for you.
 */
export function SaveButton({ item, large }: { item: CardTitle; large?: boolean }) {
  const [saved, setSaved] = useState(item.verdict === "watchlist");
  const [busy, setBusy] = useState(false);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    try {
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tmdbId: item.tmdbId, kind: item.kind, verdict: next ? "watchlist" : null }),
      });
      forgetTitles();
      if (!res.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.title} from your list` : `Save ${item.title} for later`}
      className={cn(
        "grid place-items-center rounded-full border transition",
        large ? "size-[42px]" : "size-8",
        saved ? "border-want/60 bg-black/60 text-want" : "border-white/15 bg-black/60 text-ink hover:bg-black/80",
      )}
    >
      <svg viewBox="0 0 24 24" className={cn("fill-current", large ? "size-[18px]" : "size-4")} aria-hidden>
        {saved ? (
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" />
        ) : (
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
        )}
      </svg>
    </button>
  );
}

/** The iPad's card: a wide picture, its name and where it streams under it.
 * The whole card opens the title; nothing else is on it. */
function WideCard({ item, onOpen }: { item: CardTitle; onOpen: (r: Ref) => void }) {
  const tag = item.releaseLabel ?? item.episodeLabel;
  const caption = item.reason ?? item.platforms[0]?.name ?? (item.year ? String(item.year) : "");
  return (
    <button type="button" onClick={() => onOpen(item)} aria-label={`Open ${item.title}`} className="group block w-[300px] shrink-0 snap-start text-start xl:w-[340px]">
      <span className="relative block aspect-video w-full overflow-hidden rounded-[14px] bg-surface">
        <Thumb src={item.backdrop ?? item.poster} className="absolute inset-0 size-full transition-transform duration-300 group-hover:scale-[1.04]" />
        {tag ? (
          <span className="numeric absolute start-2.5 top-2.5 rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold text-love-soft">
            {tag}
          </span>
        ) : null}
      </span>
      <span className="mt-2 block truncate text-[15px] font-semibold">{item.title}</span>
      <span className={cn("numeric block truncate text-[12.5px]", item.reason ? "text-love-soft" : "text-ink-dim")}>{caption || "\u00a0"}</span>
    </button>
  );
}

/** One line of what is in each screen, for Home's sections. */
const SECTIONS: { id: string; line: string }[] = [
  { id: "today", line: "Out today" },
  { id: "news", line: "Headlines" },
  { id: "library", line: "Following & watchlist" },
  { id: "studios", line: "By studio" },
  { id: "friends", line: "What friends watch" },
  { id: "f1", line: "Races & standings" },
  { id: "universes", line: "Franchises, in order" },
];

/**
 * Every screen as a grid on Home ("Explore"), so the bar is not the only way
 * in — the same as the app.
 */
/** Each screen's own colour in "Explore"; F1's is the sport's red, Today's the mark's green. */
const SECTION_TINT: Record<string, string> = {
  today: "#00d084",
  news: "#4a9eff",
  library: "#ffb020",
  studios: "#a78bfa",
  friends: "#ff6b9d",
  f1: "#ff3b30",
  universes: "#22d3ee",
};

function Sections({ explore }: { explore: Explore }) {
  return (
    <section>
      <Heading title="Explore" />
      {/* Seven screens: the first is twice as wide, so the grid closes with
          no hole at two columns (1 + 3 rows of 2) and at four (2 rows). */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        {SECTIONS.map(({ id, line }, i) => {
          const t = WEB_TABS[id];
          const now = explore[id];
          const wide = i === 0;
          const posters = now?.posters ?? [];
          return (
            <Link
              key={id}
              href={t.href}
              style={{ "--tint": SECTION_TINT[id] } as React.CSSProperties}
              className={cn(
                "group relative isolate flex min-h-[112px] flex-col justify-between gap-3 overflow-hidden rounded-[18px] p-3.5 ring-1 ring-inset ring-[color-mix(in_srgb,var(--tint)_22%,transparent)] transition duration-200",
                "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--tint)_13%,var(--color-surface)),var(--color-surface)_62%)]",
                "hover:ring-[color-mix(in_srgb,var(--tint)_55%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--tint)] active:scale-[0.99] lg:min-h-[128px] lg:p-4",
                wide && "col-span-2",
              )}
            >
              {id === "f1" ? (
                // No poster is ours to use here; the flag is.
                <span
                  aria-hidden
                  className="absolute inset-y-0 end-0 -z-10 w-2/3 bg-[repeating-conic-gradient(color-mix(in_srgb,var(--tint)_26%,transparent)_0_25%,transparent_0_50%)] bg-[length:26px_26px] [mask-image:linear-gradient(to_left,#000,transparent)]"
                />
              ) : null}

              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--tint)]">
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                  <path d={t.icon} fillRule="evenodd" />
                </svg>
                {t.label}
              </span>

              <span className="flex items-end gap-3">
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-bold leading-tight tracking-tight", wide ? "text-[20px] lg:text-[22px]" : "text-[16px] lg:text-[19px]")}>
                    {now?.line ?? line}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-dim lg:text-[13px]">
                    {now?.line ? (now.sub ?? line) : now?.sub ?? "\u00a0"}
                  </span>
                </span>

                {/* A few posters from inside, overlapping like a hand of cards.
                    On a phone only the wide card has the room. */}
                {posters.length ? (
                  <span aria-hidden className={cn("shrink-0 items-end ps-3", wide ? "flex" : "hidden lg:flex")}>
                    {posters.map((src, n) => (
                      // eslint-disable-next-line @next/next/no-img-element -- a small poster, a logo or a newsroom's picture
                      <img
                        key={src}
                        src={localImage(src)}
                        alt=""
                        loading="lazy"
                        style={{ zIndex: posters.length - n }}
                        className={cn(
                          "-ms-3 h-[66px] w-[44px] rounded-[7px] shadow-card ring-1 ring-black/40 transition duration-300 group-hover:-translate-y-1",
                          id === "studios" ? "bg-[#f2f2ee] object-contain p-1.5" : "object-cover",
                          n === 1 && "rotate-3 group-hover:delay-75",
                          n === 2 && "rotate-6 group-hover:delay-150",
                          wide && "lg:h-[78px] lg:w-[52px]",
                        )}
                      />
                    ))}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Heading({ title, detail, more }: { title: string; detail?: string; more?: string }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 text-[20px] font-semibold tracking-tight lg:mb-4 lg:text-[24px] lg:font-bold">
      <span className="shrink-0">{title}</span>
      {detail ? <span className="min-w-0 truncate text-[13px] font-normal text-ink-dim">{detail}</span> : null}
      {more ? (
        <Link href={more} className="ms-auto shrink-0 text-[13px] font-medium text-love-soft hover:underline">
          See all
        </Link>
      ) : null}
    </h2>
  );
}

function Shelf({
  title,
  detail,
  more,
  cards,
  onOpen,
}: {
  title: string;
  detail?: string;
  more?: string;
  cards: CardTitle[];
  onOpen: (r: Ref) => void;
}) {
  return (
    <section>
      <Heading title={title} detail={detail} more={more} />
      {/* Posters on a phone, as in the app; wide pictures on a computer, as on the iPad. */}
      <div className="lg:hidden">
        <Rail>
          {cards.map((c) => (
            <RailItem key={`${c.kind}-${c.tmdbId}`}>
              <TitleCard item={c} onOpen={onOpen} />
            </RailItem>
          ))}
        </Rail>
      </div>
      {/* The wrapper does the hiding: .strip sets its own display, which
          beat `hidden` and showed both rows on a phone. */}
      <div className="hidden lg:block">
        <div className="strip -mx-10 snap-x scroll-px-10 gap-5 px-10 pb-1">
          {cards.map((c) => (
            <WideCard key={`${c.kind}-${c.tmdbId}`} item={c} onOpen={onOpen} />
          ))}
        </div>
      </div>
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
    forgetTitles();
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
      onClick={onOpen}
      className={cn(
        "relative h-[230px] cursor-pointer snap-start overflow-hidden rounded-[24px] bg-surface",
        single ? "w-full sm:w-[560px]" : "w-[calc(100vw-4.5rem)] sm:w-[520px]",
      )}
    >
      <Thumb src={item.backdrop ?? item.poster} className="absolute inset-0 size-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/35 to-black/90" />
      {/* A rating outside your levels, on a show you follow. */}
      {item.ageWarn && item.age ? (
        <span className="numeric absolute end-3 top-3 rounded-full bg-against px-2.5 py-1 text-[11.5px] font-bold text-white">
          {item.age}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-[18px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-love-soft">
          New episode · {dayLabel(item.date, today)}
        </div>
        <h3 className="mt-1 truncate text-[24px] font-bold text-white">{item.title}</h3>
        <div className="numeric text-[13px] text-white/75">
          {/* Spelled out, so the card reads as one episode rather than the whole show. */}
          {[`Season ${item.season}`, `Episode ${item.episode}`, where?.name].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-3 flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
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
      className="grid size-[42px] place-items-center rounded-full border border-white/15 bg-black/45 text-ink transition hover:bg-black/65"
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
  const byDay = new Map<string, CalendarEpisode[]>();
  for (const e of shown) byDay.set(e.airs, [...(byDay.get(e.airs) ?? []), e]);

  /* A week at a time, a column a day — empty days included, so it reads as a
     calendar and "nothing on Thursday" is something you can see. It used to
     be a list of rows as wide as the screen, with only the days that had
     something. */
  const [second, setSecond] = useState(false);
  const from = second ? 7 : 0;
  const week = Array.from({ length: 7 }, (_, n) => addDaysISO(today, from + n));
  const later = [...byDay.keys()].some((d) => d >= addDaysISO(today, 7));
  const [open, setOpen] = useState<string | null>(null);
  const ROOM = 4;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 lg:mb-4">
        <h2 className="flex items-baseline gap-2 text-[20px] font-semibold tracking-tight lg:text-[24px] lg:font-bold">
          Airing
          <span className="text-[13px] font-normal text-ink-dim">{second ? "the week after" : "this week"}</span>
        </h2>
        <Tabs className="w-full sm:ms-auto sm:w-[360px]" value={filter} onChange={setFilter} options={AIRING_TABS.map(([id, l]) => [id, l])} />
        {later || second ? (
          <button
            type="button"
            onClick={() => setSecond((v) => !v)}
            className="flex h-9 items-center gap-1 rounded-full border border-line-strong px-3.5 text-[13px] font-medium text-ink-dim transition hover:border-white/30 hover:text-ink"
          >
            {second ? "‹ This week" : "Next week ›"}
          </button>
        ) : null}
      </div>

      {!shown.length ? (
        <p className="mb-3 text-[14px] text-ink-dim">
          {filter === "mine" ? "None of the shows you follow air in the next two weeks." : "Nothing on the calendar."}
        </p>
      ) : null}

      {/* All seven across only where each column still has room for a
          show's name (a wide computer window). Narrower than that — a phone,
          a tablet, a small window — the same columns keep a readable width in
          a row you swipe along: seven squeezed into a tablet cut every name
          off after a few letters. */}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:scroll-px-6 [scrollbar-width:none] sm:-mx-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-7 xl:gap-2.5 xl:overflow-visible xl:px-0 [&::-webkit-scrollbar]:hidden">
        {week.map((day) => {
          const list = byDay.get(day) ?? [];
          const isToday = day === today;
          const at = new Date(`${day}T12:00:00Z`);
          const all = open === day;
          return (
            <div
              key={day}
              className={cn(
                "flex w-[46%] shrink-0 snap-start flex-col rounded-2xl border p-2 sm:w-[200px] xl:w-auto xl:min-w-0",
                isToday ? "border-love/40 bg-love/[0.06]" : "border-line bg-surface/50",
              )}
            >
              <div className="mb-2 flex items-baseline justify-between px-1 pt-0.5">
                <span className={cn("text-[12px] font-semibold uppercase tracking-wider", isToday ? "text-love" : "text-ink-dim")}>
                  {isToday ? "Today" : at.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                </span>
                <span className={cn("numeric text-[18px] font-bold leading-none", isToday ? "text-love" : list.length ? "text-ink" : "text-ink-faint")}>
                  {at.getUTCDate()}
                </span>
              </div>

              {list.length ? (
                <div className="flex flex-col gap-1.5">
                  {(all ? list : list.slice(0, ROOM)).map((ep) => (
                    <button
                      key={`${ep.show}-${ep.season}-${ep.episode}`}
                      type="button"
                      onClick={() => ep.tmdbId && onOpen({ tmdbId: ep.tmdbId, kind: "tv" })}
                      className="flex items-center gap-2 rounded-xl bg-surface p-1.5 text-start transition hover:bg-card"
                    >
                      <Thumb src={ep.poster} className="h-[54px] w-9 shrink-0 rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[12.5px] font-medium leading-tight [overflow-wrap:anywhere]">{ep.show}</span>
                        {/* The episode and the service each on its own line: joined, a
                            column's width cut them to "S17 E23 ·…". */}
                        <span className={cn("numeric mt-0.5 block text-[11px] leading-tight", ep.following ? "text-love" : "text-ink-dim")}>
                          S{ep.season} E{ep.episode}
                          {ep.platforms[0] ? <span className="block truncate text-ink-faint">{ep.platforms[0].name}</span> : null}
                        </span>
                      </span>
                    </button>
                  ))}
                  {list.length > ROOM ? (
                    <button
                      type="button"
                      onClick={() => setOpen(all ? null : day)}
                      className="rounded-lg py-1.5 text-[12px] font-medium text-ink-dim transition hover:text-ink"
                    >
                      {all ? "Show fewer" : `+${list.length - ROOM} more`}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="grid min-h-[60px] flex-1 place-items-center text-[12px] text-ink-faint">Nothing</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
