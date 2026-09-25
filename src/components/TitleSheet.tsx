"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Service } from "./ServiceBadge";
import { PeopleRow, type PersonChipData } from "./People";
import { PersonSheet } from "./PersonSheet";
import { Episodes, shortDate, type ProgressData } from "./Episodes";
import { isTopSheet, popSheet, pushSheet } from "./sheets";
import { cn } from "@/lib/cn";
import { backdropUrl } from "@/lib/images";
import type { MediaKind, Verdict } from "@/db/schema";

export type SheetTitle = {
  tmdbId: number;
  kind: MediaKind;
  title: string;
  tagline: string | null;
  overview: string | null;
  year: number | null;
  releaseDate: string | null;
  runtime: number | null;
  seasons: number | null;
  genres: string[];
  rating: number | null;
  poster: string | null;
  backdrop: string | null;
  cast: string[];
  directors: string[];
  trailer: string | null;
  /** Directors first, then the cast, with faces — each opens their page. */
  people?: PersonChipData[];
  platforms: Service[];
  verdict: Verdict | null;
  following: boolean;
  /** A series: how many episodes, how many out, how many you watched. */
  progress?: ProgressData | null;
  /** Its age rating, "18+" or "PG"; null when unrated. */
  age?: string | null;
};

const cairoToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * When it comes out, said the useful way: a film's full date ("12 Nov 2026",
 * or "Coming 12 Nov 2026"), a series' year, or when it premieres if it has
 * not yet.
 */
function releaseFact(kind: MediaKind, releaseDate: string | null, year: number | null) {
  if (!releaseDate) return year?.toString();
  const full = `${shortDate(releaseDate).split(" ").slice(1).join(" ")} ${releaseDate.slice(0, 4)}`;
  const future = releaseDate > cairoToday();
  if (kind === "movie") return future ? `Coming ${full}` : full;
  return future ? `Premieres ${full}` : releaseDate.slice(0, 4);
}

/**
 * The one place a title is acted on. Cards and rows open this rather than each
 * carrying their own buttons, so there is a single definition of what you can
 * do with a title.
 */
export function TitleSheet({
  tmdbId,
  kind,
  signedIn,
  onClose,
}: {
  tmdbId: number;
  kind: MediaKind;
  signedIn: boolean;
  onClose: () => void;
}) {
  /**
   * What was fetched, stored with which title it was fetched for.
   *
   * These were two pieces of state that the fetch effect had to blank on every
   * change of title. Tagging the response instead makes "we have nothing for
   * this one yet" derivable, and a reply for a title you have already navigated
   * away from can no longer be mistaken for this one's.
   */
  const id = `${kind}:${tmdbId}`;
  const [loaded, setLoaded] = useState<{
    for: string;
    data: SheetTitle | null;
    error: string | null;
  } | null>(null);

  const current = loaded?.for === id ? loaded : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  /** Reflect a change we just made, without re-fetching the whole title. */
  const patch = useCallback(
    (next: SheetTitle) => setLoaded({ for: id, data: next, error: null }),
    [id],
  );

  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Drag the sheet down to dismiss. Past a third of its height, let it go.
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const startY = e.clientY;
    const startedAt = performance.now();
    const height = e.currentTarget.parentElement?.getBoundingClientRect().height ?? 600;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSliding(false);

    const move = (ev: PointerEvent) => setOffset(Math.max(0, ev.clientY - startY));
    const end = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      setSliding(true);

      const travelled = ev.clientY - startY;
      const speed = travelled / Math.max(performance.now() - startedAt, 1);
      // A quick flick should close it even if it barely moved.
      if (travelled > height * 0.3 || speed > 0.6) onClose();
      else setOffset(0);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
  };

  useEffect(() => {
    let live = true;
    fetch(`/api/title/${kind}/${tmdbId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: SheetTitle) => live && setLoaded({ for: id, data: d, error: null }))
      .catch((e: Error) => live && setLoaded({ for: id, data: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [tmdbId, kind, id]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const me = pushSheet();
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      // Only the sheet in front: a person opened from here is a sheet too.
      if (!isTopSheet(me)) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      popSheet(me);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, [onClose]);

  const setVerdict = useCallback(
    async (verdict: Verdict) => {
      if (!data) return;
      const next = data.verdict === verdict ? null : verdict;
      setBusy(true);
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tmdbId: data.tmdbId, kind: data.kind, verdict: next }),
      });
      setBusy(false);
      if (res.ok) patch({ ...data, verdict: next });
    },
    [data, patch],
  );

  const toggleFollow = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    const res = await fetch("/api/follow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId: data.tmdbId, following: !data.following }),
    });
    setBusy(false);
    if (res.ok) patch({ ...data, following: !data.following });
  }, [data, patch]);

  /** Where the rating menu is drawn, fixed to the screen, or null when shut. */
  const [rating, setRating] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  /** The phone's share sheet where there is one; otherwise copy the link. */
  const share = async () => {
    if (!data) return;
    const url = `${window.location.origin}/title/${data.kind}/${data.tmdbId}`;
    const where = data.platforms[0]?.name;
    const text = where ? `${data.title} — watch it on ${where}` : data.title;
    if (navigator.share) {
      await navigator.share({ title: data.title, text, url }).catch(() => null);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const router = useRouter();
  const signIn = () => {
    onClose();
    router.push("/admin/login");
  };

  /* The app's meta line: when it comes out, then seasons and episodes or
     running time, two genres and the score. */
  const facts = data
    ? [
        releaseFact(data.kind, data.releaseDate, data.year),
        data.kind === "tv" && data.seasons
          ? `${data.seasons} season${data.seasons > 1 ? "s" : ""}` +
            (data.progress?.totalEpisodes ? ` · ${data.progress.totalEpisodes} episodes` : "")
          : data.runtime
            ? `${Math.floor(data.runtime / 60) ? `${Math.floor(data.runtime / 60)}h ` : ""}${data.runtime % 60}m`
            : null,
        data.age,
        ...data.genres.slice(0, 2),
        data.rating ? `★ ${data.rating}` : null,
      ].filter(Boolean)
    : [];

  /**
   * Rendered on <body>, never where it was opened from.
   *
   * A z-index only competes inside its own stacking context. Opened from the
   * search field this sheet sat inside <header>, which is z-20, so the search
   * results — portalled to the body at z-45 — painted straight over it: the
   * sheet was there, correct and interactive, with only a sliver of it showing
   * above the results. Tapping a result looked like nothing happening.
   *
   * Laid out like the iPhone app's title sheet: the picture across the top with
   * the title on it, where to watch as full-width rows, then what you think of
   * it, then the story and the people.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={data?.title ?? "Title details"}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      /* On a phone this is a sheet that rises from the bottom edge, where the
         thumb already is; a centred dialog puts its close button and actions in
         the hardest part of the screen to reach. */
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xl sm:items-center sm:p-6"
    >
      <div
        ref={panelRef}
        onClick={(e) => {
          e.stopPropagation();
          setRating(null);
        }}
        className={cn(
          "relative flex w-full max-w-[560px] flex-col overflow-hidden bg-bg shadow-[0_-10px_60px_rgba(0,0,0,.7)]",
          // Full height on a phone: a half sheet wastes the screen and leaves
          // the actions crowded against the bottom edge.
          "h-[96dvh] rounded-t-[28px] border-x border-t border-white/10",
          "sm:h-auto sm:max-h-[90dvh] sm:rounded-[28px] sm:border sm:shadow-[0_30px_90px_rgba(0,0,0,.75)]",
          sliding ? "transition-transform duration-200" : "",
        )}
        style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      >
        {/* The handle is the visible affordance, but the whole strip across the
            top drags — aiming at a 4px bar with a thumb is a poor target. */}
        <div
          onPointerDown={startDrag}
          className="absolute inset-x-0 top-0 z-20 flex h-8 cursor-grab touch-none justify-center pt-2.5 active:cursor-grabbing sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-white/40" />
        </div>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute end-4 top-4 z-20 grid size-9 place-items-center rounded-full border border-white/15 bg-black/40 text-ink backdrop-blur-xl transition hover:bg-black/60"
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
            <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" />
          </svg>
        </button>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain" onScroll={() => rating && setRating(null)}>
          {/* The picture, with the title set on it as it fades into the sheet. */}
          <div
            className="relative h-[260px] w-full bg-surface bg-cover bg-center"
            style={
              data?.backdrop || data?.poster
                ? { backgroundImage: `url('${backdropUrl(data.backdrop ?? data.poster!)}')` }
                : undefined
            }
          >
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg" />
            {data ? (
              <div className="absolute inset-x-5 bottom-0">
                <h2 className="text-[28px] font-bold leading-tight tracking-tight">{data.title}</h2>
                <p className="numeric mt-1 text-[13px] text-ink-dim">{facts.join(" · ")}</p>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="p-6 text-center text-ink-faint">Couldn’t load this title — {error}</p>
          ) : !data ? (
            <p className="p-6 text-center text-ink-faint">Loading…</p>
          ) : (
            <div className="flex flex-col gap-5 px-5 pb-10 pt-5">
              <section className="flex flex-col gap-2.5">
                <h3 className="text-[13px] font-semibold text-ink-dim">
                  {data.platforms.length ? "Watch on" : signedIn ? "Not on your services in Egypt" : "Not on a tracked service"}
                </h3>
                {data.platforms.map((p) => (
                  <a
                    key={p.name}
                    href={p.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-2xl bg-surface p-3 transition hover:bg-card"
                  >
                    {p.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- TMDB logo
                      <img src={p.logo} alt="" className="size-[30px] rounded-[7px]" />
                    ) : null}
                    <span className="flex-1 text-[16px] font-semibold">{p.name}</span>
                    <svg viewBox="0 0 24 24" className="size-5 fill-love" aria-hidden>
                      <path d="M7 4v16l13-8z" />
                    </svg>
                  </a>
                ))}
              </section>

              {/* Always shown: hidden when signed out, they looked missing
                  rather than locked. Signed out, any of them goes to sign in. */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  {data.kind === "tv" ? (
                    <Pill on={data.following} disabled={busy} onClick={signedIn ? toggleFollow : signIn} label={data.following ? "Following" : "Follow"}>
                      <path d={data.following ? ICON.bookmarkOn : ICON.bookmark} />
                    </Pill>
                  ) : null}
                  {/* Added shows as a tick, so it is plain whether it is on your list. */}
                  <Pill
                    on={data.verdict === "watchlist"}
                    disabled={busy}
                    onClick={signedIn ? () => setVerdict("watchlist") : signIn}
                    label={data.verdict === "watchlist" ? "In Watchlist" : "Watchlist"}
                  >
                    <path d={data.verdict === "watchlist" ? ICON.checkOn : ICON.plus} />
                  </Pill>
                  {/* An eye, so its mark is not mistaken for the watchlist's tick;
                      the words change too, so it never rests on colour alone. */}
                  <Pill
                    on={data.verdict === "seen"}
                    disabled={busy}
                    onClick={signedIn ? () => setVerdict("seen") : signIn}
                    label={data.verdict === "seen" ? "Watched" : "Mark as seen"}
                  >
                    <path d={data.verdict === "seen" ? ICON.eyeOn : ICON.eye} fillRule="evenodd" />
                  </Pill>

                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Rate"
                      aria-expanded={rating !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!signedIn) return signIn();
                        if (rating) return setRating(null);
                        /* Placed from where the star actually is: on a phone
                           the star wraps to the start of its own line, and a
                           menu hung from its far edge ran off the screen. */
                        const r = e.currentTarget.getBoundingClientRect();
                        const width = 208;
                        const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, 12), window.innerWidth - width - 12);
                        const above = r.top > 260;
                        setRating({ left, top: above ? r.top - 8 : r.bottom + 8, above });
                      }}
                      className={cn(
                        "grid size-11 place-items-center rounded-full bg-surface transition hover:bg-card",
                        data.verdict === "love" || data.verdict === "like" ? "text-love" : "text-ink",
                      )}
                    >
                      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
                        {/* Your rating, or an empty thumb inviting one. Hidden,
                            seen and watchlist are not ratings, so they leave it empty. */}
                        {data.verdict === "love" || data.verdict === "like" || data.verdict === "dislike" ? (
                          <path d={RATE_ICON[data.verdict]} />
                        ) : (
                          <path d={RATE_ICON.like} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
                        )}
                      </svg>
                    </button>
                    {rating ? (
                      <div
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                        style={{ left: rating.left, top: rating.top }}
                        className={cn(
                          "fixed z-[60] w-52 overflow-hidden rounded-2xl border border-white/10 bg-card/95 py-1 shadow-pop backdrop-blur-xl",
                          rating.above && "-translate-y-full",
                        )}
                      >
                        {RATINGS.map(([verdict, label]) => (
                          <button
                            key={verdict}
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              setRating(null);
                              if (data.verdict !== verdict) setVerdict(verdict);
                            }}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-start text-[14px] transition hover:bg-white/5",
                              data.verdict === verdict && "text-love",
                            )}
                          >
                            <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
                              <path d={RATE_ICON[verdict]} />
                            </svg>
                            {label}
                          </button>
                        ))}
                        {data.verdict && data.verdict !== "watchlist" && data.verdict !== "seen" ? (
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              setRating(null);
                              setVerdict(data.verdict!);
                            }}
                            className="w-full px-4 py-2.5 text-start text-[14px] text-against transition hover:bg-white/5"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* A mox link to this title, to send as a recommendation. */}
                  <button
                    type="button"
                    onClick={share}
                    aria-label={copied ? "Link copied" : "Share"}
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition",
                      copied ? "bg-love/20 text-love" : "bg-surface text-ink hover:bg-card",
                    )}
                  >
                    <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
                      <path d={copied ? ICON.checkOn : ICON.share} />
                    </svg>
                    {copied ? "Link copied" : "Share"}
                  </button>
                </div>
                {!signedIn ? (
                  <a href="/admin/login" className="text-[13px] text-ink-faint transition hover:text-ink">
                    Sign in to rate this, follow it or add it to your list.
                  </a>
                ) : null}
              </div>

              {data.tagline ? <p className="text-[15px] font-medium italic text-love-soft">{data.tagline}</p> : null}
              {data.overview ? <p className="text-[15px] leading-relaxed text-ink/85">{data.overview}</p> : null}
              {data.kind === "tv" && data.progress ? (
                <Episodes key={data.tmdbId} tmdbId={data.tmdbId} progress={data.progress} signedIn={signedIn} />
              ) : null}
              {data.people?.length ? (
                <PeopleRow title="Cast & crew" people={data.people} onOpen={(p) => setPerson(p.id)} size={68} />
              ) : (
                <>
                  {data.cast.length ? <Credit label="Starring">{data.cast.join(", ")}</Credit> : null}
                  {data.directors.length ? <Credit label="By">{data.directors.join(", ")}</Credit> : null}
                </>
              )}

              {data.trailer ? (
                <a
                  href={data.trailer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[14px] font-medium text-love backdrop-blur-xl transition hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
                    <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7H5zm5 1.5 5 3.5-5 3.5z" />
                  </svg>
                  Watch the trailer
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {person !== null ? <PersonSheet id={person} signedIn={signedIn} onClose={() => setPerson(null)} /> : null}
    </div>,
    document.body,
  );
}

const ICON = {
  bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1zm1 2v12.5l5-3 5 3V5H7z",
  bookmarkOn: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z",
  plus: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v4h4v2h-4v4h-2v-4H7v-2h4V7h2z",
  share: "M12 2.6 16.7 7.3l-1.4 1.4L13 6.4V15h-2V6.4L8.7 8.7 7.3 7.3 12 2.6zM5 11h3v2H6v7h12v-7h-2v-2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z",
  checkOn: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm4.3 6.3-5.3 5.3-2.3-2.3-1.4 1.4 3.7 3.7 6.7-6.7-1.4-1.4z",
  eyeOn:
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 5.5c-3.2 0-5.9 1.9-7 4.5 1.1 2.6 3.8 4.5 7 4.5s5.9-1.9 7-4.5c-1.1-2.6-3.8-4.5-7-4.5zm0 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  eye: "M12 5c5 0 9.3 3.1 11 7-1.7 3.9-6 7-11 7S2.7 15.9 1 12c1.7-3.9 6-7 11-7zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
};

const RATE_ICON: Record<string, string> = {
  love: "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2 0 3.3 1 5.3 3 2-2 3.3-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z",
  like: "M2 10h4v11H2zm6 11V10l5-7 1.2.8c.5.4.7 1 .6 1.6L14 9h6.5c1 0 1.8 1 1.5 2l-2 8.5c-.2.9-1 1.5-1.9 1.5H8z",
  dislike: "M22 14h-4V3h4zm-6-11v11l-5 7-1.2-.8c-.5-.4-.7-1-.6-1.6L10 15H3.5c-1 0-1.8-1-1.5-2l2-8.5C4.2 3.6 5 3 5.9 3H16z",
  hidden: "M2.8 1.4 1.4 2.8l3.2 3.2C3 7.3 1.8 9 1 12c1.7 4.4 6 7.5 11 7.5 1.8 0 3.5-.4 5-1.1l4.2 4.2 1.4-1.4L2.8 1.4zM12 6.5c-.9 0-1.8.2-2.6.5l1.9 1.9L12 8.9a3 3 0 0 1 3.1 3.1v.7l3.4 3.4c1.9-1.2 3.4-2.9 4.5-5.1-1.7-4.4-6-7.5-11-7.5z",
};

const RATINGS: [Verdict, string][] = [
  ["love", "Loved it"],
  ["like", "Liked it"],
  ["dislike", "Not for me"],
  ["hidden", "Hide it"],
];

function Pill({
  on,
  disabled,
  onClick,
  label,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-11 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition disabled:opacity-50",
        on ? "bg-love/20 text-love" : "bg-surface text-ink hover:bg-card",
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
        {children}
      </svg>
      {label}
    </button>
  );
}

function Credit({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-ink-dim">{label}</div>
      <div className="mt-0.5 text-[14px] text-ink">{children}</div>
    </div>
  );
}
