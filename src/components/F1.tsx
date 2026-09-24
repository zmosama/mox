"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

type Session = { kind: string; label: string; at: string };
type Race = {
  season: number;
  round: number;
  name: string;
  circuit: string;
  locality: string;
  country: string;
  sessions: Session[];
  at: string;
  sprint: boolean;
  status: "done" | "live" | "next" | "upcoming";
  watched: boolean;
};
type Result = { position: number | null; driver: string; code: string | null; team: string; detail: string; points: number };
type Results = { race: Result[]; sprint: Result[]; quali: Result[] };
type Standing = { position: number; name: string; team: string | null; points: number; wins: number };

export type F1BoardData = {
  season: number;
  watch: { name: string; url: string };
  shield: boolean;
  next: Race | null;
  races: Race[];
  latest: { round: number; name: string; results: Results | null } | null;
  standings: { afterRound: number; drivers: Standing[]; teams: Standing[] } | null;
};

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
 * The F1 tab: the next weekend with every session in Cairo time, the latest
 * result behind the spoiler shield, the standings, and the season.
 */
export function F1({ data, signedIn }: { data: F1BoardData; signedIn: boolean }) {
  const router = useRouter();
  const now = useNow();
  const [table, setTable] = useState<"drivers" | "teams">("drivers");
  const [openRound, setOpenRound] = useState<number | null>(null);

  const reveal = async (round: number) => {
    await markWatched(data.season, round, true);
    router.refresh();
  };

  const next = data.next;
  const upcoming = next && now ? next.sessions.find((s) => Date.parse(s.at) > now) : null;
  const live = next && now ? next.sessions.find((s) => Date.parse(s.at) <= now && now < Date.parse(s.at) + 2 * 3600_000) : null;

  return (
    <>
      <div className="mb-7 flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight">F1</h1>
        <span className="numeric text-[13px] text-ink-dim">{data.season} season</span>
      </div>

      {next ? (
        <section className="mb-10 overflow-hidden rounded-[22px] bg-surface">
          <div className="bg-gradient-to-br from-[#e10600]/25 via-transparent to-transparent px-5 pb-4 pt-5">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-dim">
              Round {next.round} · {next.sprint ? "Sprint weekend" : "Race weekend"}
            </div>
            <h2 className="mt-1 text-[24px] font-bold tracking-tight">{next.name}</h2>
            <div className="text-[13px] text-ink-dim">
              {next.circuit} · {next.locality}, {next.country}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
                className="rounded-full bg-love px-4 py-1.5 text-[13px] font-semibold text-bg"
              >
                Watch on {data.watch.name}
              </a>
            </div>
          </div>
          <Sessions sessions={next.sessions} now={now} />
        </section>
      ) : null}

      {data.latest ? (
        <section className="mb-10">
          <h2 className="mb-3 flex items-baseline gap-2 text-[20px] font-semibold tracking-tight">
            Latest result <span className="text-[13px] font-normal text-ink-dim">{data.latest.name}</span>
          </h2>
          {data.latest.results ? (
            <ResultsView results={data.latest.results} />
          ) : (
            <Shielded signedIn={signedIn} onReveal={() => reveal(data.latest!.round)} />
          )}
        </section>
      ) : null}

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-tight">Standings</h2>
          <Segmented value={table} onChange={setTable} options={[["drivers", "Drivers"], ["teams", "Teams"]]} />
        </div>
        {data.standings ? (
          <>
            {data.latest && data.standings.afterRound < data.latest.round ? (
              <p className="mb-3 text-[12.5px] text-ink-faint">
                As they stood after round {data.standings.afterRound} — the rounds since are still hidden.
              </p>
            ) : null}
            <ol className="overflow-hidden rounded-[18px] bg-surface">
              {(table === "drivers" ? data.standings.drivers : data.standings.teams).map((s) => (
                <li key={s.name} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <span className="numeric w-6 text-[13px] text-ink-faint">{s.position}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {s.name}
                    {s.team ? <span className="ms-2 text-[12px] font-normal text-ink-faint">{s.team}</span> : null}
                  </span>
                  <span className="numeric text-[14px] font-semibold">{s.points}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-[13.5px] text-ink-dim">
            Hidden until you&apos;ve watched a race — the standings give the results away.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[20px] font-semibold tracking-tight">Season</h2>
        <ol className="overflow-hidden rounded-[18px] bg-surface">
          {data.races.map((r) => (
            <li key={r.round} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={() => setOpenRound(openRound === r.round ? null : r.round)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-card"
              >
                <span className="numeric w-6 text-[13px] text-ink-faint">{r.round}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{r.name}</span>
                  <span className="block text-[12px] text-ink-faint">
                    {dayMonth.format(new Date(r.sessions[0].at))} – {dayMonth.format(new Date(r.at))}
                    {r.sprint ? " · Sprint" : ""}
                  </span>
                </span>
                <RoundBadge race={r} />
              </button>
              {openRound === r.round ? (
                <RoundDetail race={r} signedIn={signedIn} now={now} onReveal={() => reveal(r.round)} />
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function RoundBadge({ race }: { race: Race }) {
  if (race.status === "live") return <span className="rounded-full bg-[#e10600] px-2 py-0.5 text-[11px] font-semibold">Live</span>;
  if (race.status === "next") return <span className="rounded-full bg-love/20 px-2 py-0.5 text-[11px] font-semibold text-love">Next</span>;
  if (race.status === "done") {
    return race.watched ? (
      <span className="text-[11.5px] font-medium text-love">✓ Watched</span>
    ) : (
      <span className="text-[11.5px] text-ink-faint">Done</span>
    );
  }
  return null;
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

function ResultsView({ results }: { results: Results }) {
  const tabs = ([
    ["race", "Race"],
    ["sprint", "Sprint"],
    ["quali", "Qualifying"],
  ] as const).filter(([k]) => results[k].length);
  const [tab, setTab] = useState<"race" | "sprint" | "quali">(tabs[0]?.[0] ?? "race");
  const rows = results[tab];
  if (!tabs.length) return <p className="text-[13.5px] text-ink-dim">Results aren&apos;t in yet.</p>;

  return (
    <div className="overflow-hidden rounded-[18px] bg-surface">
      {tabs.length > 1 ? (
        <div className="border-b border-line px-3 py-2">
          <Segmented value={tab} onChange={setTab} options={tabs.map(([k, l]) => [k, l])} />
        </div>
      ) : null}
      <ol>
        {rows.map((r) => (
          <li key={r.driver} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <span className={cn("numeric w-6 text-[13px]", r.position && r.position <= 3 ? "font-bold text-love" : "text-ink-faint")}>
              {r.position ?? "–"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {r.driver}
              <span className="ms-2 text-[12px] font-normal text-ink-faint">{r.team}</span>
            </span>
            <span className="numeric text-[12.5px] text-ink-dim">{r.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoundDetail({
  race,
  signedIn,
  now,
  onReveal,
}: {
  race: Race;
  signedIn: boolean;
  now: number | null;
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

  return (
    <div className="bg-bg/40 pb-3">
      <Sessions sessions={race.sessions} now={now} />
      {race.status === "done" ? (
        <div className="px-3 pt-3">
          {results === "loading" ? (
            <p className="px-2 text-[13px] text-ink-dim">Loading results…</p>
          ) : results ? (
            <ResultsView results={results} />
          ) : (
            <Shielded signedIn={signedIn} onReveal={onReveal} />
          )}
        </div>
      ) : null}
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
