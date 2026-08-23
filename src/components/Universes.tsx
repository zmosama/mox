"use client";

import { useMemo, useState } from "react";
import { Poster } from "./Poster";
import { ServiceBadge, type Service } from "./ServiceBadge";
import { TitleSheet } from "./TitleSheet";
import { cn } from "@/lib/cn";
import type { MediaKind, Verdict } from "@/db/schema";

export type UniverseTitle = {
  tmdbId: number;
  kind: MediaKind;
  title: string;
  year: number | null;
  date: string;
  poster: string | null;
  rating: number | null;
  verdict: Verdict | null;
  upcoming: boolean;
  platforms: Service[];
};

export type Universe = {
  slug: string;
  name: string;
  titles: UniverseTitle[];
};

const RING: Partial<Record<Verdict, string>> = {
  love: "ring-love",
  like: "ring-like",
  watchlist: "ring-want",
  dislike: "ring-against",
};

/**
 * Films and series kept apart, each in release order.
 *
 * These used to be grouped under a heading per year, which on a phone meant a
 * franchise spread over thirty years became thirty groups of one poster each,
 * every one taking a full row. The year already sits under every poster, so
 * the headings were spending the whole screen to repeat it.
 */
export function Universes({
  universes,
  signedIn,
}: {
  universes: Universe[];
  signedIn: boolean;
}) {
  const [slug, setSlug] = useState(universes[0]?.slug ?? "");
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);

  const universe = universes.find((u) => u.slug === slug) ?? universes[0];

  const seen = universe?.titles.filter(
    (t) => t.verdict && t.verdict !== "watchlist" && t.verdict !== "hidden",
  ).length ?? 0;
  const available = universe?.titles.filter((t) => t.platforms.length).length ?? 0;
  const unreleased = universe?.titles.filter((t) => t.upcoming).length ?? 0;
  const pct = universe?.titles.length ? Math.round((seen / universe.titles.length) * 100) : 0;

  const sections = useMemo(() => {
    if (!universe) return [];
    return (["movie", "tv"] as const)
      .map((kind) => {
        const list = universe.titles.filter((t) => t.kind === kind);
        return {
          kind,
          label: kind === "movie" ? "Films" : "Series",
          total: list.length,
          titles: list.slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.date.localeCompare(b.date)),
        };
      })
      .filter((s) => s.total > 0);
  }, [universe]);

  if (!universe) return <p className="py-16 text-center text-ink-faint">No universes yet</p>;

  return (
    <>
      {/* Six names, some of them long — as equal columns they would be
          unreadable, and as a sideways strip they ran off the screen and cut
          "James Bond" in half. Short labels wrap onto a second line instead,
          and the full name is the heading directly beneath. */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {universes.map((u) => {
          const uSeen = u.titles.filter(
            (t) => t.verdict && t.verdict !== "watchlist" && t.verdict !== "hidden",
          ).length;
          return (
            <button
              key={u.slug}
              type="button"
              title={u.name}
              onClick={() => setSlug(u.slug)}
              className={cn(
                "min-h-11 rounded-full border px-3.5 text-[12.5px] font-semibold transition whitespace-nowrap sm:min-h-0 sm:py-1.5",
                u.slug === slug
                  ? "border-ink bg-ink text-bg shadow-card"
                  : "border-line-strong text-ink-dim active:text-ink sm:hover:border-ink-faint sm:hover:text-ink",
              )}
            >
              {shortName(u)}
              <span className="numeric ms-1.5 text-[11px] opacity-60">
                {uSeen}/{u.titles.length}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="text-base font-semibold">{universe.name}</h2>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] text-ink-dim sm:flex sm:flex-wrap sm:gap-6">
        <Stat value={`${seen}/${universe.titles.length}`} label="seen" />
        <Stat value={`${pct}%`} label="complete" />
        <Stat value={available} label={signedIn ? "on your services" : "on tracked services"} />
        <Stat value={unreleased} label="unreleased" />
      </div>

      <div className="my-4 h-1.5 max-w-md overflow-hidden rounded-full bg-line-strong">
        <div
          className="h-full bg-gradient-to-r from-like to-love"
          style={{ width: `${pct}%` }}
        />
      </div>

      {sections.map((section) => (
        <div key={section.kind}>
          <div className="mb-3 mt-7 flex items-center gap-3">
            <b className="text-sm font-semibold">{section.label}</b>
            <span className="numeric text-[11px] font-semibold text-ink-faint">
              {section.total}
            </span>
            <i className="h-px flex-1 bg-line" />
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-2.5 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))]">
            {section.titles.map((t) => (
                  <div key={`${t.tmdbId}-${t.kind}`} className="group relative">
                    <button
                      type="button"
                      onClick={() => setOpen({ tmdbId: t.tmdbId, kind: t.kind })}
                      aria-label={`Open ${t.title}`}
                      className={cn(
                        "relative block w-full overflow-hidden rounded-tile transition-transform group-hover:scale-[1.03]",
                        t.verdict && RING[t.verdict] ? `ring-2 ring-inset ${RING[t.verdict]}` : "",
                      )}
                    >
                      <Poster
                        src={t.poster}
                        alt={t.title}
                        size="w185"
                        className={cn(
                          "w-full",
                          t.upcoming
                            ? "opacity-50"
                            : t.verdict && t.verdict !== "watchlist"
                              ? ""
                              : "opacity-45 grayscale-[70%]",
                        )}
                      />
                      {t.upcoming ? (
                        <span className="absolute end-1 top-1 z-10 rounded bg-want px-1.5 py-0.5 text-[10px] font-bold text-[#2b1a02]">
                          Soon
                        </span>
                      ) : null}
                    </button>
                    {t.platforms[0] ? (
                      <span className="absolute start-1 top-1 z-10">
                        <ServiceBadge service={t.platforms[0]} title={t.title} iconOnly />
                      </span>
                    ) : null}
                    <div className="mt-1.5 text-xs font-semibold leading-snug">{t.title}</div>
                    <div className="numeric text-[11px] text-ink-faint">
                      {t.year}
                      {t.rating ? ` · ★ ${t.rating}` : ""}
                    </div>
                  </div>
            ))}
          </div>
        </div>
      ))}

      {open ? (
        <TitleSheet
          tmdbId={open.tmdbId}
          kind={open.kind}
          signedIn={signedIn}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/**
 * A chip-sized name. Anything not listed keeps its full name, which is right
 * for a short one and only ever costs a wider chip — nothing gets clipped.
 */
const SHORT: Record<string, string> = {
  mcu: "Marvel",
  dceu: "DC Extended",
  dcu: "DC Universe",
  dc_animated: "DC Animated",
};

const shortName = (u: Universe) => SHORT[u.slug] ?? u.name;

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <b className="numeric block text-lg font-bold text-ink">{value}</b>
      {label}
    </div>
  );
}
