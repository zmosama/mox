"use client";

/**
 * The Calendar page: every episode of the month, past days included, so
 * "what did I miss" has an answer. Home's Airing stays a week ahead.
 */
import { useEffect, useState } from "react";
import { MoxPulse } from "./Loading";
import { Tabs } from "./Tabs";
import { TitleSheet } from "./TitleSheet";
import { cn } from "@/lib/cn";
import { addDaysISO, addMonths, monthOf, monthRange } from "@/lib/dates";
import { localImage } from "@/lib/images";
import type { CalendarEpisode } from "@/lib/queries";
import type { MediaKind } from "@/db/schema";

type Ref = { tmdbId: number; kind: MediaKind };

const AIRING_TABS = [
  ["mine", "Your shows"],
  ["available", "On services"],
  ["all", "All"],
] as const;

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized files
    <img src={localImage(src)} alt="" loading="lazy" className={cn("bg-card object-cover", className)} />
  ) : (
    <div className={cn("bg-card", className)} />
  );
}

/** One episode on the calendar: the poster, the show, the episode and where. */
function AiringEpisode({ ep, onOpen }: { ep: CalendarEpisode; onOpen: (r: Ref) => void }) {
  return (
    <button
      type="button"
      onClick={() => ep.tmdbId && onOpen({ tmdbId: ep.tmdbId, kind: "tv" })}
      className="flex items-center gap-2 rounded-xl bg-surface p-1.5 text-start transition hover:bg-card"
    >
      <Thumb src={ep.poster} className="h-[46px] w-[31px] shrink-0 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[12px] font-medium leading-tight [overflow-wrap:anywhere]">{ep.show}</span>
        {/* The episode and the service each on its own line: joined, a
            column's width cut them to "S17 E23 ·…". */}
        <span className={cn("numeric mt-0.5 block text-[11px] leading-tight", ep.following ? "text-love" : "text-ink-dim")}>
          S{ep.season} E{ep.episode}
          {ep.platforms[0] ? <span className="block truncate text-ink-faint">{ep.platforms[0].name}</span> : null}
        </span>
      </span>
    </button>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthName = (month: string, withYear: boolean) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
  });

/**
 * The TV calendar, a month at a time — its own page, so Home keeps its week.
 *
 * A whole month, Sunday first like pogdesign's TV Calendar, with the days gone
 * by kept on it: a calendar that only looked ahead could never answer "what
 * did I miss this week". Today is lit, the past is dimmed but readable, and
 * the month before and after are a tap away.
 *
 * On a wide screen it is a grid, seven columns of real days. Narrower than
 * that, seven columns cannot hold a show's name, so the month becomes a list
 * of the days that have something on, with today always among them.
 */
export function TvCalendar({
  episodes,
  today,
  signedIn,
}: {
  episodes: CalendarEpisode[];
  today: string;
  signedIn: boolean;
}) {
  const [sheet, setSheet] = useState<Ref | null>(null);
  const onOpen = setSheet;
  const thisMonth = monthOf(today);
  const [filter, setFilter] = useState<string>(signedIn ? "mine" : "all");
  const [month, setMonth] = useState(thisMonth);
  const [months, setMonths] = useState<Record<string, CalendarEpisode[]>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const ROOM = 4;

  // The page brings this month; any other is asked for when it is shown.
  const loaded = month === thisMonth ? episodes : months[month];
  useEffect(() => {
    if (loaded) return;
    const ask = new AbortController();
    fetch(`/api/calendar?month=${month}`, { signal: ask.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { episodes: CalendarEpisode[] }) => {
        setFailed(null);
        setMonths((m) => ({ ...m, [month]: body.episodes }));
      })
      .catch((e: Error) => { if (e.name !== "AbortError") setFailed(month); });
    return () => ask.abort();
  }, [month, loaded, attempt]);

  const shown = (loaded ?? []).filter((e) =>
    filter === "mine" ? e.following : filter === "available" ? e.platforms.length > 0 : true,
  );
  const byDay = new Map<string, CalendarEpisode[]>();
  for (const e of shown) byDay.set(e.airs, [...(byDay.get(e.airs) ?? []), e]);

  const { from, to } = monthRange(month);
  const lead = new Date(`${from}T12:00:00Z`).getUTCDay();
  const length = Number(to.slice(8));
  const days = Array.from({ length }, (_, n) => addDaysISO(from, n));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  // The narrow list: days with something on, and today even when empty.
  const listed = days.filter((d) => byDay.has(d) || d === today);

  const step = (n: number) => { setOpen(null); setMonth((m) => addMonths(m, n)); };
  const navButton = "flex h-9 items-center gap-1 rounded-full border border-line-strong px-3.5 text-[13px] font-medium text-ink-dim transition hover:border-white/30 hover:text-ink";

  const dayCard = (day: string, compact: boolean) => {
    const list = byDay.get(day) ?? [];
    const isToday = day === today;
    const past = day < today;
    const at = new Date(`${day}T12:00:00Z`);
    const all = open === day;
    return (
      <div
        key={day}
        aria-current={isToday ? "date" : undefined}
        className={cn(
          "flex min-w-0 flex-col rounded-2xl border p-2",
          compact ? "min-h-[150px]" : "",
          isToday
            ? "border-love/60 bg-love/[0.09] shadow-[0_0_0_1px_rgba(0,0,0,0)] ring-1 ring-love/40"
            : past
              ? "border-line/60 bg-surface/25 opacity-60 transition hover:opacity-100"
              : "border-line bg-surface/50",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between px-1 pt-0.5">
          <span className={cn("text-[12px] font-semibold uppercase tracking-wider", isToday ? "text-love" : "text-ink-dim")}>
            {/* The grid has the weekdays over its columns; the list needs one on each day. */}
            {isToday ? "Today" : compact ? "" : at.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
          </span>
          <span className={cn("numeric text-[18px] font-bold leading-none", isToday ? "text-love" : list.length ? "text-ink" : "text-ink-faint")}>
            {at.getUTCDate()}
          </span>
        </div>
        {list.length ? (
          <div className={cn("grid gap-1.5", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
            {(all || !compact ? list : list.slice(0, ROOM)).map((ep) => (
              <AiringEpisode key={`${ep.show}-${ep.season}-${ep.episode}`} ep={ep} onOpen={onOpen} />
            ))}
            {compact && list.length > ROOM ? (
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
          <div className="grid min-h-[40px] flex-1 place-items-center text-[12px] text-ink-faint">Nothing</div>
        )}
      </div>
    );
  };

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="me-auto">
          <div className="text-[13px] font-medium text-love">{monthName(month, true)}</div>
          <h1 className="text-[28px] font-bold tracking-tight">Calendar</h1>
        </div>
        <Tabs className="w-full sm:w-[360px]" value={filter} onChange={setFilter} options={AIRING_TABS.map(([id, l]) => [id, l])} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} className={navButton}>‹ {monthName(addMonths(month, -1), false)}</button>
          {month !== thisMonth ? (
            <button type="button" onClick={() => { setOpen(null); setMonth(thisMonth); }} className={navButton}>Today</button>
          ) : null}
          <button type="button" onClick={() => step(1)} className={navButton}>{monthName(addMonths(month, 1), false)} ›</button>
        </div>
      </header>

      {!loaded ? (
        failed === month ? (
          <p className="py-10 text-center text-[14px] text-ink-dim">
            Could not load {monthName(month, true)}.{" "}
            <button type="button" className="font-medium text-ink underline" onClick={() => { setFailed(null); setAttempt((n) => n + 1); }}>
              Try again
            </button>
          </p>
        ) : (
          <div className="grid place-items-center py-12"><MoxPulse label={`Loading ${monthName(month, false)}`} /></div>
        )
      ) : (
        <>
          {!shown.length ? (
            <p className="mb-3 text-[14px] text-ink-dim">
              {filter === "mine" ? `None of the shows you follow air in ${monthName(month, false)}.` : `Nothing on the calendar in ${monthName(month, false)}.`}
            </p>
          ) : null}

          {/* Wide: the month as a grid. */}
          <div className="hidden lg:block">
            <div className="mb-1.5 grid grid-cols-7 gap-2.5 px-1">
              {WEEKDAYS.map((d) => (
                <span key={d} className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2.5">
              {cells.map((day, n) => (day ? dayCard(day, true) : <div key={`pad-${n}`} aria-hidden />))}
            </div>
          </div>

          {/* Narrow: the days with something on, in order. */}
          <div className="flex flex-col gap-2 lg:hidden">
            {listed.map((day) => dayCard(day, false))}
          </div>
        </>
      )}

      {sheet ? <TitleSheet tmdbId={sheet.tmdbId} kind={sheet.kind} signedIn={signedIn} onClose={() => setSheet(null)} /> : null}
    </section>
  );
}
