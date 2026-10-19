"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { flag } from "@/lib/flags";
import type { f1Board, RaceCard, ResultRow, Session, Standing, Track } from "@/lib/f1";

type Results = { race: ResultRow[]; sprint: ResultRow[]; quali: ResultRow[] };
export type F1BoardData = Awaited<ReturnType<typeof f1Board>>;

const RED = "#e10600";
const ZONE = "Africa/Cairo";
const dayTime = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short", hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short" });

/** "2d 4h", "3h 20m", "12m" until an instant. */
function until(at: string, now: number) {
  const mins = Math.max(0, Math.round((Date.parse(at) - now) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const points = (p: number) => (Number.isInteger(p) ? String(p) : p.toFixed(1));

/**
 * The clock, ticking every half minute — and null on the server and during
 * hydration, so the page never renders a countdown that is already stale.
 */
let clock = 0;
const subscribe = (tick: () => void) => {
  clock = Date.now();
  const id = setInterval(() => { clock = Date.now(); tick(); }, 30_000);
  return () => clearInterval(id);
};
function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => clock || Date.now(), () => null);
}

async function markWatched(season: number, round: number, watched: boolean) {
  await fetch("/api/f1/watched", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ season, round, watched }),
  });
}

/**
 * The F1 tab: the next weekend over its track, the latest podium behind the
 * spoiler shield, the standings with faces, and the season as a wall of
 * circuits — each finished one with its top three. The same as the app.
 */
export function F1({ data, signedIn }: { data: F1BoardData; signedIn: boolean }) {
  const router = useRouter();
  const now = useNow();
  const [table, setTable] = useState<"drivers" | "teams">("drivers");
  const [openRound, setOpenRound] = useState<RaceCard | null>(null);

  const reveal = async (round: number) => {
    await markWatched(data.season, round, true);
    router.refresh();
  };
  const hidden = data.races.filter((r) => r.status === "done" && !r.watched && !r.podium);
  const revealAll = async () => {
    for (const r of hidden) await markWatched(r.season, r.round, true);
    router.refresh();
  };

  const next = data.next;
  const upcoming = next && now ? next.sessions.find((s) => Date.parse(s.at) > now) : null;
  const live = next && now ? next.sessions.find((s) => Date.parse(s.at) <= now && now < Date.parse(s.at) + 2 * 3600_000) : null;
  const latest = data.latest;

  return (
    <>
      <div className="mb-7 flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight">F1</h1>
        <span className="numeric text-[13px] text-ink-dim">{data.season} season</span>
      </div>

      {next ? (
        <section className="mb-10 overflow-hidden rounded-[22px] bg-surface">
          <button
            type="button"
            onClick={() => setOpenRound(next)}
            className="relative block w-full bg-gradient-to-bl from-[#e10600]/30 via-transparent to-transparent px-5 pb-4 pt-5 text-start"
          >
            {next.track ? (
              <TrackMap track={next.track} color={RED} line={3.5} draws className="absolute right-3 top-3 h-[150px] w-[44%] max-w-[260px]" />
            ) : null}
            <div className="relative max-w-[60%]">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-dim">
                Round {next.round} · {next.sprint ? "Sprint weekend" : "Race weekend"}
              </div>
              <h2 className="mt-1 text-[24px] font-bold tracking-tight">
                {flag(next.country)} {next.name}
              </h2>
              <div className="text-[13px] text-ink-dim">
                {next.circuit} · {next.locality}
              </div>
              {next.track ? (
                <div className="numeric mt-1 text-[12px] text-ink-faint">
                  {(next.track.length / 1000).toFixed(3)} km · first GP {next.track.firstGp}
                </div>
              ) : null}
            </div>
            <div className="relative mt-4 flex flex-wrap items-center gap-3">
              {live ? (
                <span className="rounded-full bg-[#e10600] px-3 py-1.5 text-[13px] font-semibold">● {live.label} is live</span>
              ) : upcoming && now ? (
                <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-medium">
                  {upcoming.label} in <span className="numeric font-semibold">{until(upcoming.at, now)}</span>
                </span>
              ) : null}
              <a
                href={data.watch.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-full bg-love px-4 py-1.5 text-[13px] font-semibold text-bg"
              >
                Watch on {data.watch.name}
              </a>
            </div>
          </button>
          <Sessions sessions={next.sessions} now={now} />
        </section>
      ) : null}

      {latest ? (
        <section className="mb-10">
          <h2 className="mb-3 flex items-baseline gap-2 text-[20px] font-semibold tracking-tight">
            Latest result <span className="text-[13px] font-normal text-ink-dim">{latest.name}</span>
          </h2>
          {latest.results ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
              {latest.results.race.length ? <Podium rows={latest.results.race} /> : null}
              <ResultsView results={latest.results} />
            </div>
          ) : (
            <Shielded signedIn={signedIn} onReveal={() => reveal(latest.round)} />
          )}
        </section>
      ) : null}

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-baseline gap-2 text-[20px] font-semibold tracking-tight">
            Standings
            {data.standings ? (
              <span className="text-[13px] font-normal text-ink-dim">after round {data.standings.afterRound}</span>
            ) : null}
          </h2>
          <Segmented value={table} onChange={setTable} options={[["drivers", "Drivers"], ["teams", "Teams"]]} />
        </div>
        {data.standings ? (
          <>
            {latest && data.standings.afterRound < latest.round ? (
              <p className="mb-3 text-[12.5px] text-ink-faint">
                As they stood after round {data.standings.afterRound} — the rounds since are still hidden.
              </p>
            ) : null}
            <StandingsList rows={table === "drivers" ? data.standings.drivers : data.standings.teams} teams={table === "teams"} />
          </>
        ) : (
          <p className="text-[13.5px] text-ink-dim">
            Hidden until you&apos;ve watched a race — the standings give the results away.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-baseline gap-2 text-[20px] font-semibold tracking-tight">
            Season
            <span className="text-[13px] font-normal text-ink-dim">
              {data.races.filter((r) => r.status === "done").length} of {data.races.length} done
            </span>
          </h2>
          {data.shield && signedIn && hidden.length > 1 ? (
            <button
              type="button"
              onClick={revealAll}
              className="rounded-full bg-white/[0.08] px-4 py-1.5 text-[13px] font-semibold transition hover:bg-white/[0.14]"
            >
              Show all {hidden.length} hidden results
            </button>
          ) : null}
        </div>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.races.map((r) => (
            <li key={r.round}>
              <RaceTile race={r} now={now} onOpen={() => setOpenRound(r)} />
            </li>
          ))}
        </ol>
      </section>

      {openRound ? (
        <RoundPanel
          race={openRound}
          signedIn={signedIn}
          now={now}
          onClose={() => setOpenRound(null)}
          onReveal={() => reveal(openRound.round)}
        />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ pieces

/** A circuit's outline as a lit line: a soft wide stroke under a crisp one, start/finish marked. */
export function TrackMap({
  track,
  color,
  line = 3,
  draws = false,
  className,
}: {
  track: Track;
  color: string;
  line?: number;
  draws?: boolean;
  className?: string;
}) {
  const span = Math.max(track.w, track.h, 1);
  const pad = span * 0.05;
  const d = `M${track.points.map(([x, y]) => `${x},${y}`).join("L")}Z`;
  const [sx, sy] = track.points[0] ?? [0, 0];
  // Strokes do not scale with the drawing, so `line` is in screen pixels at any size.
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${track.w + pad * 2} ${track.h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden
    >
      <path d={d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={line * 3.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={line}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className={draws ? "f1-draw" : undefined}
      />
      <circle cx={sx} cy={sy} r={span * 0.022} fill="#f8faf8" stroke={color} strokeWidth={line * 0.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A driver's official cut-out on their team's colour; their code if there is none. */
export function Face({ photo, code, color, size = 36 }: { photo: string | null; code: string | null; color: string; size?: number }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: `linear-gradient(${color}, ${color}59)` }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- F1's own headshot, already sized
        <img src={photo} alt="" loading="lazy" className="size-full object-cover object-top" />
      ) : (
        <span className="font-bold text-white" style={{ fontSize: size * 0.3 }}>{code}</span>
      )}
    </span>
  );
}

/** A team's white logo on its own colour, as formula1.com shows it. */
export function TeamLogo({ logo, name, color, size = 36 }: { logo: string | null; name: string; color: string; size?: number }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: size * 0.28, background: `linear-gradient(135deg, ${color}, ${color}99)` }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- formula1.com's own logo
        <img src={logo} alt="" loading="lazy" className="size-full object-contain" style={{ padding: size * 0.16 }} />
      ) : (
        <span className="font-bold text-white" style={{ fontSize: size * 0.42 }}>{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

/** "▲3" for places gained from the grid, "▼2" lost. */
export function GridDelta({ grid, position }: { grid: number | null; position: number | null }) {
  if (grid === null || position === null) return null;
  if (grid === 0) return <span className="text-[11px] font-semibold text-ink-dim">Pit lane</span>;
  if (grid > position) return <span className="numeric text-[11px] font-semibold text-love">▲{grid - position}</span>;
  if (grid < position) return <span className="numeric text-[11px] font-semibold text-[#ff5a5a]">▼{position - grid}</span>;
  return <span className="text-[11px] text-ink-faint">=</span>;
}

function Sessions({ sessions, now }: { sessions: Session[]; now: number | null }) {
  return (
    <ul className="divide-y divide-line border-t border-line">
      {sessions.map((s) => {
        const past = now !== null && Date.parse(s.at) + 2 * 3600_000 < now;
        const main = s.kind === "race" || s.kind === "quali" || s.kind === "sprint";
        return (
          <li key={s.kind} className={cn("flex items-center justify-between px-5 py-2.5", past && "opacity-45")}>
            <span className={cn("text-[14px]", main ? "font-semibold" : "text-ink-dim")}>{s.label}</span>
            <span className="numeric text-[13.5px]" suppressHydrationWarning>
              {dayTime.format(new Date(s.at))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Shielded({ signedIn, onReveal }: { signedIn: boolean; onReveal: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] bg-surface px-6 py-8 text-center">
      <div className="text-[15px] font-semibold">Results hidden</div>
      <p className="max-w-sm text-[13px] text-ink-dim">
        So nothing spoils it if you&apos;re watching it later. The standings wait too.
      </p>
      {signedIn ? (
        <button type="button" onClick={onReveal} className="rounded-full bg-love px-5 py-2 text-[14px] font-semibold text-bg">
          I&apos;ve watched it — show results
        </button>
      ) : null}
    </div>
  );
}

/** The top three on steps: second, winner, third. */
function Podium({ rows }: { rows: ResultRow[] }) {
  const top = rows.slice(0, 3);
  const order = [1, 0, 2].filter((i) => i < top.length);
  return (
    <div className="flex items-end gap-3 rounded-[18px] bg-surface px-4 pt-6">
      {order.map((i) => {
        const r = top[i];
        const place = i + 1;
        return (
          <Link key={r.driverId} href={`/f1/driver/${r.driverId}`} className="group flex flex-1 flex-col items-center gap-2 text-center">
            <Face photo={r.photo} code={r.code} color={r.color} size={place === 1 ? 92 : 72} />
            <span>
              <span className="block text-[15px] font-bold group-hover:underline">{r.code ?? r.driver}</span>
              <span className="block truncate text-[11.5px] text-ink-dim">{r.team}</span>
              {r.grid ? (
                <span className="numeric flex justify-center gap-1 text-[11px] text-ink-faint">
                  from P{r.grid} <GridDelta grid={r.grid} position={r.position} />
                </span>
              ) : null}
            </span>
            <span
              className="grid w-full place-items-start justify-center rounded-t-xl pt-1.5 text-[28px] font-bold"
              style={{ height: place === 1 ? 84 : place === 2 ? 62 : 46, background: `linear-gradient(${r.color}d9, ${r.color}40)` }}
            >
              {place}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function ResultsView({ results }: { results: Results }) {
  const tabs = ([
    ["race", "Race"],
    ["sprint", "Sprint"],
    ["quali", "Qualifying"],
  ] as const).filter(([k]) => results[k].length);
  const [tab, setTab] = useState<"race" | "sprint" | "quali">(tabs[0]?.[0] ?? "race");
  const [all, setAll] = useState(false);
  if (!tabs.length) return <p className="text-[13.5px] text-ink-dim">Results aren&apos;t in yet.</p>;
  const rows = results[tab];
  const quali = tab === "quali";

  return (
    <div className="overflow-hidden rounded-[18px] bg-surface">
      {tabs.length > 1 ? (
        <div className="border-b border-line px-3 py-2">
          <Segmented value={tab} onChange={setTab} options={tabs.map(([k, l]) => [k, l])} />
        </div>
      ) : null}
      <ol>
        {(all ? rows : rows.slice(0, 10)).map((r) => (
          <li key={r.driverId || r.driver} className="border-b border-line last:border-0">
            <Link href={`/f1/driver/${r.driverId}`} className="flex items-center gap-3 px-4 py-2 transition hover:bg-white/[0.03]">
              <span className={cn("numeric w-5 text-[13px]", r.position && r.position <= 3 ? "font-bold" : "text-ink-faint")}>
                {r.position ?? "–"}
              </span>
              <Face photo={r.photo} code={r.code} color={r.color} size={34} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                  {r.driver}
                  {r.fastest ? <span className="rounded-full bg-[#b138dd] px-1.5 text-[9.5px] font-bold">FL</span> : null}
                </span>
                <span className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-faint">
                  <span className="inline-block h-2.5 w-[3px] rounded-sm" style={{ background: r.color }} />
                  {r.team}
                  {!quali && r.grid !== null ? <span className="numeric">· {r.grid === 0 ? "pit lane" : `from P${r.grid}`}</span> : null}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="numeric text-[12.5px] text-ink-dim">{r.detail}</span>
                {!quali ? <GridDelta grid={r.grid} position={r.position} /> : null}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {rows.length > 10 ? (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="w-full py-3 text-[13.5px] font-semibold text-love"
        >
          {all ? "Show top ten" : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  );
}

function StandingsList({ rows, teams }: { rows: Standing[]; teams: boolean }) {
  const leader = Math.max(rows[0]?.points ?? 1, 1);
  return (
    <ol className="grid overflow-hidden rounded-[18px] bg-surface py-1 lg:grid-cols-2">
      {rows.map((s) => (
        <li key={s.id || s.name}>
          <Link
            href={teams ? `/f1/team/${s.id}` : `/f1/driver/${s.id}`}
            className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]"
          >
            <span className={cn("numeric w-5 text-[13px]", s.position <= 3 ? "font-bold" : "text-ink-faint")}>{s.position}</span>
            {teams ? (
              <TeamLogo logo={s.photo} name={s.name} color={s.color} size={38} />
            ) : (
              <Face photo={s.photo} code={s.code} color={s.color} size={38} />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px] font-medium">{s.name}</span>
                <span className="numeric text-[14px] font-semibold">{points(s.points)}</span>
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (s.points / leader) * 100)}%`, background: s.color }} />
              </span>
              <span className="mt-1 block truncate text-[11px] text-ink-faint">
                {s.team ?? ""}
                {s.wins ? `${s.team ? " · " : ""}${s.wins} win${s.wins === 1 ? "" : "s"}` : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** One round on the season wall: its circuit, its dates, and its podium once it may be shown. */
function RaceTile({ race, now, onOpen }: { race: RaceCard; now: number | null; onOpen: () => void }) {
  const next = race.status === "next" || race.status === "live";
  const done = race.status === "done";
  const winner = race.podium?.[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-full w-full flex-col gap-2 rounded-[18px] bg-surface p-3 text-start transition hover:bg-card",
        next && "bg-gradient-to-b from-[#e10600]/25 to-surface ring-1 ring-[#e10600]/70",
        race.status === "upcoming" && "opacity-80",
      )}
    >
      <span className="numeric text-[11px] font-semibold text-ink-faint">R{race.round}</span>
      {race.track ? (
        <TrackMap
          track={race.track}
          color={next ? RED : done ? "rgba(248,250,248,.75)" : "rgba(248,250,248,.5)"}
          line={2.2}
          className="h-20 w-full"
        />
      ) : (
        <span className="h-20" />
      )}
      <span>
        <span className="block truncate text-[14.5px] font-semibold">
          {flag(race.country)} {race.name.replace(" Grand Prix", "")}
        </span>
        <span className="block text-[11.5px] text-ink-faint">
          {dayMonth.format(new Date(race.sessions[0].at))} – {dayMonth.format(new Date(race.at))}
          {race.sprint ? " · Sprint" : ""}
        </span>
      </span>
      <span className="flex h-8 items-center">
        {race.podium && winner ? (
          <span className="flex items-center gap-2">
            <span className="flex -space-x-2">
              {race.podium.map((r) => (
                <Face key={r.driverId} photo={r.photo} code={r.code} color={r.color} size={26} />
              ))}
            </span>
            <span className="leading-tight">
              <span className="block text-[12.5px] font-bold">{winner.code ?? winner.driver}</span>
              <span className="block text-[10px] text-ink-faint">{winner.team}</span>
            </span>
          </span>
        ) : race.status === "live" ? (
          <span className="rounded-full bg-[#e10600] px-2.5 py-0.5 text-[11.5px] font-semibold">● Live</span>
        ) : race.status === "next" && now ? (
          <span className="text-[11.5px] font-semibold text-[#ff4a3d]">Next · in {until(race.at, now)}</span>
        ) : done ? (
          <span className="text-[11.5px] text-ink-faint">{race.watched ? "Results soon" : "Hidden"}</span>
        ) : null}
      </span>
    </button>
  );
}

/** One round over the page: its track drawn in, its numbers, sessions and results. */
function RoundPanel({
  race,
  signedIn,
  now,
  onClose,
  onReveal,
}: {
  race: RaceCard;
  signedIn: boolean;
  now: number | null;
  onClose: () => void;
  onReveal: () => void;
}) {
  const [results, setResults] = useState<Results | null | "loading">(race.status === "done" ? "loading" : null);

  useEffect(() => {
    if (race.status !== "done") return;
    let live = true;
    fetch(`/api/f1/round/${race.round}`)
      .then((r) => r.json())
      .then((d) => live && setResults(d.results ?? null))
      .catch(() => live && setResults(null));
    return () => { live = false; };
  }, [race.round, race.status, race.watched]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const tint = race.podium?.[0]?.color ?? (race.status === "done" ? "#f8faf8" : RED);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={race.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-[720px] overflow-y-auto rounded-t-[26px] bg-bg pb-8 sm:rounded-[26px]"
      >
        <div className="sticky top-0 z-10 flex justify-end p-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full bg-white/[0.1] text-[15px] font-bold"
          >
            ✕
          </button>
        </div>
        <div className="-mt-12 px-5">
          {race.track ? (
            <div style={{ background: `radial-gradient(closest-side, ${tint}38, transparent)` }}>
              <TrackMap track={race.track} color={tint} line={4} draws className="mx-auto h-[230px] w-full" />
            </div>
          ) : null}
          <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-dim">
            Round {race.round}
            {race.sprint ? " · Sprint weekend" : ""}
          </div>
          <h2 className="text-[26px] font-bold tracking-tight">
            {flag(race.country)} {race.name}
          </h2>
          <div className="text-[13px] text-ink-dim">
            {race.circuit} · {race.locality}, {race.country}
          </div>
          {race.track ? (
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <Stat value={(race.track.length / 1000).toFixed(3)} label="km a lap" />
              <Stat value={String(race.track.firstGp)} label="first GP" />
              <Stat value={dayMonth.format(new Date(race.at))} label="race day" />
            </div>
          ) : null}
          <div className="mt-5 overflow-hidden rounded-[18px] bg-surface [&>ul]:border-t-0">
            <Sessions sessions={race.sessions} now={now} />
          </div>
          <div className="mt-5">
            {race.status === "done" ? (
              results === "loading" ? (
                <p className="text-[13px] text-ink-dim">Loading results…</p>
              ) : results ? (
                <div className="flex flex-col gap-4">
                  {results.race.length ? <Podium rows={results.race} /> : null}
                  <ResultsView results={results} />
                </div>
              ) : (
                <Shielded signedIn={signedIn} onReveal={onReveal} />
              )
            ) : (
              <p className="text-[13.5px] text-ink-dim">The podium and every result land here once the race is run.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[14px] bg-surface px-3 py-2.5">
      <div className="numeric text-[16px] font-bold">{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-bg/60 p-1 text-[12.5px] font-medium">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn("rounded-full px-3 py-1 transition", value === k ? "bg-white/[0.12] text-ink" : "text-ink-dim hover:text-ink")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
