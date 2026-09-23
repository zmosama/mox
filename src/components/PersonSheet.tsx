"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Face } from "./People";
import { Rail, RailItem } from "./Rail";
import { Grid } from "./Grid";
import { Tabs } from "./Tabs";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import { isTopSheet, popSheet, pushSheet } from "./sheets";
import { cn } from "@/lib/cn";
import { todayISO } from "@/lib/dates";
import type { MediaKind } from "@/db/schema";

type Credit = CardTitle & { date: string; role: string; as: "acting" | "crew"; popularity: number };

type Person = {
  id: number;
  name: string;
  profile: string | null;
  department: string | null;
  birthday: string | null;
  deathday: string | null;
  place: string | null;
  bio: string | null;
  credits: Credit[];
  following: boolean;
};

/**
 * An actor or director and everything they made — the app's person page.
 *
 * What you can watch tonight comes first, because that is the point of MOX:
 * not a list of their work but the part of it that is one tap away. Then what
 * is coming, then all of it, newest first.
 */
export function PersonSheet({
  id,
  signedIn,
  onClose,
}: {
  id: number;
  signedIn: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ for: number; data: Person | null; error: string | null } | null>(null);
  const data = loaded?.for === id ? loaded.data : null;
  const error = loaded?.for === id ? loaded.error : null;

  const [role, setRole] = useState<"acting" | "crew" | null>(null);
  const [kind, setKind] = useState<"all" | MediaKind>("all");
  const [bioOpen, setBioOpen] = useState(false);
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/person/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Person) => live && setLoaded({ for: id, data: d, error: null }))
      .catch((e: Error) => live && setLoaded({ for: id, data: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    const me = pushSheet();
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopSheet(me)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      popSheet(me);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  const today = todayISO();
  /* "Director" means directed: the crew credits also carry producing and the
     like, which put films he only produced under his name as a director. */
  const directed = (c: Credit) => /(^|, )Director(,|$)/.test(c.role);
  const directs = data?.credits.some((c) => c.as === "crew" && directed(c)) ?? false;
  const inCrew = (c: Credit) => c.as === "crew" && (!directs || directed(c));
  const hasActing = data?.credits.some((c) => c.as === "acting") ?? false;
  const hasCrew = data?.credits.some(inCrew) ?? false;
  // Their main job first: a director opens on what they directed.
  const as = role ?? (data?.department && data.department !== "Acting" && hasCrew ? "crew" : "acting");

  const shown = useMemo(
    () =>
      (data?.credits ?? []).filter(
        (c) =>
          (!hasActing || !hasCrew || (as === "acting" ? c.as === "acting" : inCrew(c))) &&
          (kind === "all" || c.kind === kind),
      ),
    // inCrew only reads `directs`, which follows `data`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, as, kind, hasActing, hasCrew, directs],
  );
  const now = shown.filter((c) => c.platforms.length && c.date && c.date <= today);
  const coming = shown.filter((c) => !c.date || c.date > today).reverse();

  async function toggleFollow() {
    if (!data) return;
    if (!signedIn) {
      onClose();
      router.push("/admin/login");
      return;
    }
    const following = !data.following;
    setLoaded({ for: id, data: { ...data, following }, error: null });
    await fetch("/api/people/follow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: data.id, name: data.name, profile: data.profile, following }),
    }).catch(() => null);
  }

  const age = (() => {
    if (!data?.birthday) return null;
    const end = data.deathday ? new Date(data.deathday) : new Date();
    const born = new Date(data.birthday);
    let years = end.getFullYear() - born.getFullYear();
    if (end < new Date(end.getFullYear(), born.getMonth(), born.getDate())) years--;
    return years;
  })();

  const facts = data
    ? [
        data.department === "Directing" ? "Director" : data.department === "Acting" ? "Actor" : data.department,
        age !== null ? (data.deathday ? `died at ${age}` : `${age}`) : null,
        data.place,
      ].filter(Boolean)
    : [];

  const openTitle = (c: CardTitle) => setOpen({ tmdbId: c.tmdbId, kind: c.kind });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={data?.name ?? "Person"}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xl sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex w-full max-w-[720px] flex-col overflow-hidden bg-bg shadow-[0_-10px_60px_rgba(0,0,0,.7)]",
          "h-[96dvh] rounded-t-[28px] border-x border-t border-white/10",
          "sm:h-auto sm:max-h-[90dvh] sm:rounded-[28px] sm:border",
        )}
      >
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

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 pb-10 pt-8">
          {error ? (
            <p className="p-6 text-center text-ink-faint">Couldn’t load this person — {error}</p>
          ) : !data ? (
            <p className="p-6 text-center text-ink-faint">Loading…</p>
          ) : (
            <div className="flex flex-col gap-7">
              <header className="flex flex-col items-center gap-3 text-center">
                <Face src={data.profile} name={data.name} size={128} className="ring-2 ring-love/50" />
                <div>
                  <h2 className="text-[28px] font-bold leading-tight tracking-tight">{data.name}</h2>
                  <p className="mt-1 text-[13px] text-ink-dim">{facts.join(" · ")}</p>
                </div>
                <button
                  type="button"
                  aria-pressed={data.following}
                  onClick={toggleFollow}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition",
                    data.following ? "bg-love/20 text-love" : "bg-love text-bg hover:opacity-90",
                  )}
                >
                  <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
                    <path
                      d={
                        data.following
                          ? "M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z"
                          : "M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1zm1 2v12.5l5-3 5 3V5H7z"
                      }
                    />
                  </svg>
                  {data.following ? "Following" : "Follow"}
                </button>
                {data.following ? (
                  <p className="max-w-sm text-[12.5px] text-ink-dim">
                    New work from {data.name.split(" ")[0]} shows up on Home when it reaches your services.
                  </p>
                ) : null}
              </header>

              {data.bio ? (
                <button type="button" onClick={() => setBioOpen(!bioOpen)} className="text-start">
                  <p className={cn("text-[14.5px] leading-relaxed text-ink/85", !bioOpen && "line-clamp-4")}>{data.bio}</p>
                  <span className="mt-1 inline-block text-[13px] font-medium text-love">{bioOpen ? "Less" : "More"}</span>
                </button>
              ) : null}

              <div className="flex flex-col gap-2.5 sm:flex-row">
                {hasActing && hasCrew ? (
                  <Tabs
                    className="sm:w-64"
                    value={as}
                    onChange={(v) => setRole(v as "acting" | "crew")}
                    options={[
                      ["acting", "Actor"],
                      ["crew", directs ? "Director" : "Behind the camera"],
                    ]}
                  />
                ) : null}
                <Tabs
                  className="sm:w-72"
                  value={kind}
                  onChange={(v) => setKind(v as "all" | MediaKind)}
                  options={[
                    ["all", "All"],
                    ["movie", "Films"],
                    ["tv", "TV"],
                  ]}
                />
              </div>

              {now.length ? (
                <Shelf title="On your services" detail={`${now.length}`}>
                  <Rail>
                    {now.map((c) => (
                      <RailItem key={`${c.kind}-${c.tmdbId}`}>
                        <TitleCard item={{ ...c, reason: c.role || undefined }} onOpen={openTitle} />
                      </RailItem>
                    ))}
                  </Rail>
                </Shelf>
              ) : null}

              {coming.length ? (
                <Shelf title="Coming" detail={`${coming.length}`}>
                  <Rail>
                    {coming.map((c) => (
                      <RailItem key={`${c.kind}-${c.tmdbId}`}>
                        <TitleCard item={{ ...c, releaseLabel: c.date ? c.date.slice(0, 4) : "Soon" }} onOpen={openTitle} />
                      </RailItem>
                    ))}
                  </Rail>
                </Shelf>
              ) : null}

              <Shelf title="Everything" detail={`${shown.length}`}>
                {shown.length ? (
                  <Grid>
                    {shown.map((c) => (
                      <TitleCard key={`${c.kind}-${c.tmdbId}`} item={c} onOpen={openTitle} />
                    ))}
                  </Grid>
                ) : (
                  <p className="text-[14px] text-ink-dim">Nothing here.</p>
                )}
              </Shelf>
            </div>
          )}
        </div>
      </div>

      {open ? <TitleSheet tmdbId={open.tmdbId} kind={open.kind} signedIn={signedIn} onClose={() => setOpen(null)} /> : null}
    </div>,
    document.body,
  );
}

function Shelf({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-baseline gap-2 text-[20px] font-semibold tracking-tight">
        {title}
        {detail ? <span className="numeric text-[13px] font-normal text-ink-dim">{detail}</span> : null}
      </h3>
      {children}
    </section>
  );
}
