"use client";

import { useMemo, useState } from "react";
import { Rail, RailItem } from "./Rail";
import { Section } from "./Section";
import { Tabs } from "./Tabs";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";
import type { MediaKind } from "@/db/schema";

export type ReleaseItem = CardTitle & { date: string };

type When = "out" | "soon";
type Kind = "all" | MediaKind;

/**
 * Everything recently added, read as a timeline: a date, then that date split
 * by service. One undifferentiated grid made it impossible to answer "what
 * landed on Netflix this week", which is the actual question.
 */
export function NewReleases({
  available,
  upcoming,
  today,
  signedIn,
}: {
  available: ReleaseItem[];
  upcoming: ReleaseItem[];
  today: string;
  signedIn: boolean;
}) {
  const [when, setWhen] = useState<When>("out");
  const [kind, setKind] = useState<Kind>("all");
  const [service, setService] = useState<string>("");
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);

  const source = when === "soon" ? upcoming : available;

  const pool = useMemo(
    () => source.filter((m) => kind === "all" || m.kind === kind),
    [source, kind],
  );

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of pool) {
      for (const p of m.platforms) out.set(p.name, (out.get(p.name) ?? 0) + 1);
    }
    return [...out].sort((a, b) => b[1] - a[1]);
  }, [pool]);

  const shown = useMemo(() => {
    const list = pool.filter((m) => !service || m.platforms.some((p) => p.name === service));
    return list.sort((a, b) =>
      when === "soon" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
  }, [pool, service, when]);

  // date -> service -> titles
  const grouped = useMemo(() => {
    const days = new Map<string, Map<string, ReleaseItem[]>>();
    for (const m of shown) {
      const byService = days.get(m.date) ?? new Map<string, ReleaseItem[]>();
      const names = m.platforms.length
        ? m.platforms.map((p) => p.name)
        : [signedIn ? "Not on your services" : "No tracked service"];
      for (const n of names) byService.set(n, [...(byService.get(n) ?? []), m]);
      days.set(m.date, byService);
    }
    return days;
  }, [shown, signedIn]);

  return (
    <>
      <Section
        title={
          when === "soon"
            ? "Coming soon"
            : signedIn
              ? "New on your services"
              : "New on tracked services"
        }
        count={shown.length}
      >
        {/* Two rows of full-width tabs. Side by side these overflowed the
            screen and clipped "TV" against the edge. */}
        <div className="mb-4 grid gap-2">
          <Tabs
            value={when}
            onChange={(v) => setWhen(v as When)}
            options={[
              ["out", "Available"],
              ["soon", "Coming soon"],
            ]}
          />
          <Tabs
            value={kind}
            onChange={(v) => setKind(v as Kind)}
            options={[
              ["all", "All"],
              ["movie", "Films"],
              ["tv", "TV"],
            ]}
          />
        </div>

        {/* The services are a filter, not a tab set, and there are eight of
            them — they wrap onto a second line rather than running off. */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {when === "out" && counts.length ? (
            <>
              <button
                type="button"
                onClick={() => setService("")}
                className={cn(
                  "min-h-11 rounded-lg px-3.5 text-[13px] font-semibold transition sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-xs",
                  service ? "text-ink-faint hover:text-ink" : "bg-surface text-ink",
                )}
              >
                All
              </button>
              {counts.map(([name, n]) => {
                const logo = pool
                  .flatMap((m) => m.platforms)
                  .find((p) => p.name === name)?.logo;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => setService(service === name ? "" : name)}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 rounded-lg border p-[3px] pe-2.5 text-[12px] font-semibold transition sm:min-h-0 sm:pe-2 sm:text-[11.5px]",
                      service === name
                        ? "border-ink bg-surface text-ink opacity-100"
                        : "border-transparent text-ink-faint opacity-60 hover:border-line-strong hover:opacity-100",
                    )}
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- TMDB logo
                      <img src={logo} alt={name} className="size-6 rounded-md object-cover" />
                    ) : (
                      <span className="px-1">{name}</span>
                    )}
                    <span className="numeric">{n}</span>
                  </button>
                );
              })}
            </>
          ) : null}
        </div>

        {grouped.size ? (
          <div className="relative ps-6 before:absolute before:bottom-1.5 before:start-[5px] before:top-1.5 before:w-0.5 before:rounded before:bg-line-strong">
            {[...grouped].map(([date, byService]) => (
              <div
                key={date}
                className="relative mb-6 before:absolute before:-start-6 before:top-1.5 before:size-3 before:rounded-full before:bg-love before:shadow-[0_0_0_4px_var(--color-bg)]"
              >
                <span
                  className={cn(
                    "inline-block rounded-md border px-2.5 py-1 text-xs font-bold",
                    date === today
                      ? "border-love bg-love text-[#04210f]"
                      : "border-line-strong bg-card text-ink",
                  )}
                >
                  {dayLabel(date, today)}
                </span>

                {[...byService]
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([name, list]) => (
                    <div key={name} className="mt-3">
                      <div className="mb-2 flex items-center gap-2">
                        {list[0].platforms.find((p) => p.name === name)?.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- TMDB logo
                          <img
                            src={list[0].platforms.find((p) => p.name === name)!.logo!}
                            alt={name}
                            className="size-[22px] rounded-md object-cover"
                          />
                        ) : null}
                        <b className="text-[13px] font-semibold">{name}</b>
                        <span className="numeric text-xs text-ink-faint">
                          {list.length} title{list.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <Rail>
                        {list.map((m) => (
                          <RailItem key={`${m.tmdbId}-${m.kind}`}>
                            <TitleCard
                              item={
                                when === "soon"
                                  ? { ...m, releaseLabel: dayLabel(m.date, today) }
                                  : m
                              }
                              onOpen={(i) => setOpen({ tmdbId: i.tmdbId, kind: i.kind })}
                            />
                          </RailItem>
                        ))}
                      </Rail>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-card border border-dashed border-line-strong bg-card px-6 py-6 text-center text-[13.5px] text-ink-faint">
            Nothing matches that filter
          </p>
        )}
      </Section>

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
