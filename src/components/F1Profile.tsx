import Link from "next/link";
import type { f1Driver, f1Team, SeasonEntry } from "@/lib/f1";
import { flag } from "@/lib/flags";
import { Face, GridDelta, Stat, TeamLogo } from "./F1";

type Driver = NonNullable<Awaited<ReturnType<typeof f1Driver>>>;
type Team = NonNullable<Awaited<ReturnType<typeof f1Team>>>;

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
const pts = (p: number) => (Number.isInteger(p) ? String(p) : p.toFixed(1));

function age(born: string | null) {
  if (!born) return null;
  const b = new Date(born);
  const now = new Date();
  return now.getFullYear() - b.getFullYear() - (now < new Date(now.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}

/** A driver: their photo big, number in the team's colour, the career in numbers, the season round by round. */
export function DriverProfile({ d }: { d: Driver }) {
  const years = age(d.born);
  return (
    <div className="flex flex-col gap-8">
      <Back />
      <section className="relative overflow-hidden rounded-[26px] bg-surface">
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div
            className="relative h-[400px] overflow-hidden sm:h-[480px]"
            style={{ background: `linear-gradient(${d.color}d9, ${d.color}4d 60%, transparent)` }}
          >
            {d.number ? (
              <span className="numeric absolute left-4 top-8 text-[240px] font-bold leading-none text-white/[0.14]">{d.number}</span>
            ) : null}
            {d.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- F1's own 2026 portrait
              <img src={d.photo} alt="" className="absolute right-[6%] top-8 w-[58%] max-w-[300px] object-contain object-top" />
            ) : null}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface to-transparent" />
          </div>
          <div className="relative flex flex-col justify-end gap-5 p-6">
            <div>
              <h1 className="text-[34px] font-bold leading-tight tracking-tight">{d.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-dim">
                {d.team ? (
                  d.teamId ? (
                    <Link href={`/f1/team/${d.teamId}`} className="flex items-center gap-1.5 font-semibold text-ink hover:underline">
                      <span className="h-3.5 w-1 rounded-sm" style={{ background: d.color }} /> {d.team} ›
                    </Link>
                  ) : (
                    <span>{d.team}</span>
                  )
                ) : null}
                {d.nationality ? <span>{flag(d.nationality)} {d.nationality}</span> : null}
                {years ? <span>{years}</span> : null}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">{d.season.year} season</div>
              <div className="grid grid-cols-3 gap-2.5">
                <Stat value={d.season.position ? `P${d.season.position}` : "—"} label="standing" />
                <Stat value={d.season.points === null ? "—" : pts(d.season.points)} label="points" />
                <Stat value={n(d.season.wins)} label="wins" />
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">Career</div>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                <Stat value={n(d.career.titles)} label="titles" />
                <Stat value={n(d.career.wins)} label="wins" />
                <Stat value={n(d.career.podiums)} label="podiums" />
                <Stat value={n(d.career.poles)} label="poles" />
                <Stat value={n(d.career.starts)} label="starts" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <Rounds rounds={d.season.rounds} showDriver={false} />
      <About bio={d.bio} wiki={d.wiki} />
    </div>
  );
}

/** A team: logo over its colour, its drivers, the numbers, its season. */
export function TeamProfile({ t }: { t: Team }) {
  const current = t.drivers.filter((x) => x.current);
  const others = t.drivers.filter((x) => !x.current);
  return (
    <div className="flex flex-col gap-8">
      <Back />
      <section
        className="relative overflow-hidden rounded-[26px] px-6 pb-6 pt-8"
        style={{ background: `linear-gradient(160deg, ${t.color}, ${t.color}59 55%, transparent)` }}
      >
        <div className="flex items-center gap-5">
          <TeamLogo logo={t.photo} name={t.name} color={t.color} size={96} />
          <div>
            <h1 className="text-[34px] font-bold tracking-tight">{t.name}</h1>
            {t.nationality ? <div className="text-[14px] text-white/75">{flag(t.nationality)} {t.nationality}</div> : null}
          </div>
        </div>
        {t.car ? (
          // eslint-disable-next-line @next/next/no-img-element -- formula1.com's 2026 car
          <img src={t.car} alt={`${t.name} 2026 car`} className="mx-auto mt-6 w-full max-w-[760px] drop-shadow-[0_18px_24px_rgba(0,0,0,0.45)]" />
        ) : null}
      </section>
      {current.length ? (
        <section>
          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">{t.season.year} drivers</div>
          <div className="grid grid-cols-2 gap-3">
            {current.map((seat) => (
              <Link
                key={seat.id}
                href={`/f1/driver/${seat.id}`}
                className="flex flex-col items-center gap-2 rounded-[18px] bg-surface py-5 text-center transition hover:bg-card"
              >
                <Face photo={seat.photo} code={seat.code} color={t.color} size={92} />
                <span className="text-[14px] font-semibold">{seat.name}</span>
                {seat.number ? <span className="numeric text-[12px] font-bold" style={{ color: t.color }}>#{seat.number}</span> : null}
              </Link>
            ))}
          </div>
          {others.length ? (
            <>
              <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Also drove this year</div>
              <div className="flex flex-wrap gap-2">
                {others.map((seat) => (
                  <Link key={seat.id} href={`/f1/driver/${seat.id}`} className="flex items-center gap-2 rounded-full bg-surface py-1 pe-3 ps-1 text-[13px] font-medium hover:bg-card">
                    <Face photo={seat.photo} code={seat.code} color={t.color} size={28} />
                    {seat.name}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}
      <section className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">{t.season.year} season</div>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat value={t.season.position ? `P${t.season.position}` : "—"} label="standing" />
            <Stat value={t.season.points === null ? "—" : pts(t.season.points)} label="points" />
            <Stat value={n(t.season.wins)} label="wins" />
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">All time</div>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat value={n(t.career.titles)} label="titles" />
            <Stat value={n(t.career.wins)} label="wins" />
            <Stat value={n(t.career.starts)} label="races" />
          </div>
        </div>
      </section>
      <Rounds rounds={t.season.rounds} showDriver />
      <About bio={t.bio} wiki={t.wiki} />
    </div>
  );
}

function Back() {
  return (
    <Link href="/f1" className="-mb-4 text-[13.5px] font-semibold text-ink-dim hover:text-ink">
      ‹ F1
    </Link>
  );
}

function Rounds({ rounds, showDriver }: { rounds: SeasonEntry[]; showDriver: boolean }) {
  if (!rounds.length) return null;
  return (
    <section>
      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">Round by round</div>
      <ol className="grid overflow-hidden rounded-[18px] bg-surface sm:grid-cols-2">
        {[...rounds].reverse().map((e) => (
          <li key={e.round} className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <span className={`numeric w-10 text-[15px] font-bold ${e.position && e.position <= 3 ? "text-love" : ""}`}>
              {e.position ? `P${e.position}` : "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{e.name.replace(" Grand Prix", " GP")}</span>
              <span className="flex gap-1.5 text-[11.5px] text-ink-faint">
                {showDriver ? <span>{e.driver}</span> : null}
                {e.grid !== null ? <span>{e.grid === 0 ? "pit lane" : `from P${e.grid}`}</span> : null}
                <GridDelta grid={e.grid} position={e.position} />
              </span>
            </span>
            <span className={`numeric text-[13px] font-semibold ${e.points ? "" : "text-ink-faint"}`}>
              {e.points ? `+${pts(e.points)}` : "0"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function About({ bio, wiki }: { bio: string | null; wiki: string | null }) {
  if (!bio) return null;
  return (
    <section className="max-w-2xl">
      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-dim">About</div>
      <p className="text-[14.5px] leading-relaxed text-ink/85">{bio}</p>
      {wiki ? (
        <a href={wiki} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] font-semibold text-love">
          More on Wikipedia ↗
        </a>
      ) : null}
      <p className="mt-2 text-[11px] text-ink-faint">Photo and text: Wikipedia, CC BY-SA.</p>
    </section>
  );
}
