/**
 * Formula 1: the season's calendar, results and standings, from Jolpica.
 *
 * Jolpica is the community continuation of the Ergast API — free, no key, the
 * whole calendar with every session's start in UTC, and results within hours of
 * a race. It asks for no more than a few requests a second, so answers are
 * kept in memory: the calendar for hours, results for minutes, and anything
 * that fails falls back to the last good answer rather than an empty page.
 *
 * The one decision here that is ours is the spoiler shield. A race is often
 * watched hours later, recorded, and every results page in the world opens
 * with who won. With the shield on, a round's results — and standings that
 * include it — stay covered until you say you have watched it.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const BASE = "https://api.jolpi.ca/ergast/f1";

/** Where the races are shown here. The owner watches on TOD. */
export const WATCH = { name: "TOD", url: "https://www.tod.tv/" };

// ------------------------------------------------------------------ types

export type SessionKind = "fp1" | "fp2" | "fp3" | "sprintQuali" | "sprint" | "quali" | "race";

export type Session = { kind: SessionKind; label: string; at: string };

export type Race = {
  season: number;
  round: number;
  name: string;
  circuit: string;
  locality: string;
  country: string;
  sessions: Session[];
  /** The race's own start, UTC. */
  at: string;
  sprint: boolean;
};

export type RaceStatus = "done" | "live" | "next" | "upcoming";

export type ResultRow = {
  position: number | null;
  driver: string;
  code: string | null;
  team: string;
  /** Finishing time, gap, "+1 Lap", or why they stopped. */
  detail: string;
  points: number;
};

export type Standing = { position: number; name: string; team: string | null; points: number; wins: number };

// ------------------------------------------------------------------ parsing

type JolpicaSession = { date: string; time?: string };
type JolpicaRace = {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: { circuitName: string; Location: { locality: string; country: string } };
  FirstPractice?: JolpicaSession;
  SecondPractice?: JolpicaSession;
  ThirdPractice?: JolpicaSession;
  SprintQualifying?: JolpicaSession;
  SprintShootout?: JolpicaSession;
  Sprint?: JolpicaSession;
  Qualifying?: JolpicaSession;
};

const SESSIONS: [keyof JolpicaRace, SessionKind, string][] = [
  ["FirstPractice", "fp1", "Practice 1"],
  ["SecondPractice", "fp2", "Practice 2"],
  ["ThirdPractice", "fp3", "Practice 3"],
  ["SprintQualifying", "sprintQuali", "Sprint Qualifying"],
  ["SprintShootout", "sprintQuali", "Sprint Qualifying"],
  ["Sprint", "sprint", "Sprint"],
  ["Qualifying", "quali", "Qualifying"],
];

/** A date and an optional "13:00:00Z" as one instant. A missing time is noon
    UTC — close enough to put it on the right day, and never shown as a time. */
const instant = (s: JolpicaSession) => new Date(`${s.date}T${s.time ?? "12:00:00Z"}`).toISOString();

/** One race from Jolpica's shape to ours, sessions in the order they run. */
export function parseRace(r: JolpicaRace): Race {
  const sessions: Session[] = [];
  for (const [field, kind, label] of SESSIONS) {
    const s = r[field] as JolpicaSession | undefined;
    if (s?.date) sessions.push({ kind, label, at: instant(s) });
  }
  const at = instant({ date: r.date, time: r.time });
  sessions.push({ kind: "race", label: "Race", at });
  sessions.sort((a, b) => a.at.localeCompare(b.at));
  return {
    season: Number(r.season),
    round: Number(r.round),
    name: r.raceName,
    circuit: r.Circuit.circuitName,
    locality: r.Circuit.Location.locality,
    country: r.Circuit.Location.country,
    sessions,
    at,
    sprint: sessions.some((s) => s.kind === "sprint"),
  };
}

/** A Grand Prix runs about two hours; results are worth asking for after three. */
const RACE_HOURS = 3;

export function statusOf(race: Race, races: Race[], now: Date): RaceStatus {
  const start = Date.parse(race.at);
  const end = start + RACE_HOURS * 3600_000;
  if (now.getTime() >= end) return "done";
  if (now.getTime() >= start) return "live";
  const next = races.find((r) => Date.parse(r.at) + RACE_HOURS * 3600_000 > now.getTime());
  return next?.round === race.round ? "next" : "upcoming";
}

/**
 * Which round's results and standings may be shown.
 *
 * Shield off: the latest finished round. Shield on: the latest finished round
 * you have marked watched — standings after round 14 contain round 14's
 * result, so they wait for it too.
 */
export function revealedRound(done: number[], watched: Set<number>, shield: boolean): number | null {
  const candidates = shield ? done.filter((r) => watched.has(r)) : done;
  return candidates.length ? Math.max(...candidates) : null;
}

type JolpicaResult = {
  position?: string;
  positionText?: string;
  points?: string;
  status?: string;
  Time?: { time?: string };
  Q3?: string;
  Q2?: string;
  Q1?: string;
  Driver: { givenName: string; familyName: string; code?: string };
  Constructor: { name: string };
};

export function parseResult(r: JolpicaResult): ResultRow {
  const position = Number(r.position ?? r.positionText);
  return {
    position: Number.isFinite(position) ? position : null,
    driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
    code: r.Driver.code ?? null,
    team: r.Constructor.name,
    detail: r.Time?.time ?? r.Q3 ?? r.Q2 ?? r.Q1 ?? r.status ?? "",
    points: Number(r.points ?? 0),
  };
}

// ------------------------------------------------------------------ fetching

type Cached = { at: number; body: unknown };
const cache = new Map<string, Cached>();

/**
 * One Jolpica answer, from memory while it is fresh. A failed request returns
 * the last good answer however old — a stale calendar beats an empty tab —
 * and only throws when there has never been one.
 */
async function jolpica<T>(path: string, ttlSeconds: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlSeconds * 1000) return hit.body as T;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "user-agent": "mox (https://mox.mosama.me)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Jolpica answered ${res.status}`);
    const body = await res.json();
    cache.set(path, { at: Date.now(), body });
    return body as T;
  } catch (e) {
    if (hit) return hit.body as T;
    throw e;
  }
}

type RaceTable<R> = { MRData: { RaceTable: { Races: R[] } } };

export async function season(): Promise<Race[]> {
  const body = await jolpica<RaceTable<JolpicaRace>>("/current.json", 6 * 3600);
  return body.MRData.RaceTable.Races.map(parseRace);
}

type WithResults = JolpicaRace & {
  Results?: JolpicaResult[];
  SprintResults?: JolpicaResult[];
  QualifyingResults?: JolpicaResult[];
};

/** A finished round's results: the race, the sprint if there was one, qualifying. */
export async function roundResults(year: number, round: number) {
  // Settled results never change; a race that finished minutes ago still might.
  const ttl = 20 * 60;
  const [race, sprint, quali] = await Promise.all(
    [
      [`/${year}/${round}/results.json?limit=40`, "Results"],
      [`/${year}/${round}/sprint.json?limit=40`, "SprintResults"],
      [`/${year}/${round}/qualifying.json?limit=40`, "QualifyingResults"],
    ].map(async ([path, field]) => {
      try {
        const body = await jolpica<RaceTable<WithResults>>(path, ttl);
        const rows = body.MRData.RaceTable.Races[0]?.[field as "Results"] ?? [];
        return rows.map(parseResult);
      } catch {
        return [];
      }
    }),
  );
  return { race, sprint, quali };
}

type StandingsTable<S> = { MRData: { StandingsTable: { StandingsLists: S[] } } };

/** Drivers' and constructors' standings as they stood after `round`. */
export async function standingsAfter(year: number, round: number) {
  const ttl = 20 * 60;
  const [drivers, teams] = await Promise.all([
    jolpica<StandingsTable<{ DriverStandings: {
      position: string; points: string; wins: string;
      Driver: { givenName: string; familyName: string }; Constructors: { name: string }[];
    }[] }>>(`/${year}/${round}/driverStandings.json?limit=40`, ttl)
      .then((b) => (b.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? []).map((d) => ({
        position: Number(d.position),
        name: `${d.Driver.givenName} ${d.Driver.familyName}`,
        team: d.Constructors.at(-1)?.name ?? null,
        points: Number(d.points),
        wins: Number(d.wins),
      })))
      .catch(() => [] as Standing[]),
    jolpica<StandingsTable<{ ConstructorStandings: {
      position: string; points: string; wins: string; Constructor: { name: string };
    }[] }>>(`/${year}/${round}/constructorStandings.json?limit=40`, ttl)
      .then((b) => (b.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? []).map((c) => ({
        position: Number(c.position),
        name: c.Constructor.name,
        team: null,
        points: Number(c.points),
        wins: Number(c.wins),
      })))
      .catch(() => [] as Standing[]),
  ]);
  return { drivers, teams };
}

// ------------------------------------------------------------------ watched

export function watchedRounds(userId: number | null, year: number): Set<number> {
  if (userId === null) return new Set();
  return new Set(
    db
      .select({ round: schema.f1Watched.round })
      .from(schema.f1Watched)
      .where(and(eq(schema.f1Watched.userId, userId), eq(schema.f1Watched.season, year)))
      .all()
      .map((r) => r.round),
  );
}

export function setWatched(userId: number, year: number, round: number, watched: boolean) {
  const where = and(
    eq(schema.f1Watched.userId, userId),
    eq(schema.f1Watched.season, year),
    eq(schema.f1Watched.round, round),
  );
  if (watched) {
    db.insert(schema.f1Watched).values({ userId, season: year, round }).onConflictDoNothing().run();
  } else {
    db.delete(schema.f1Watched).where(where).run();
  }
}

// ------------------------------------------------------------------ pages

export type RaceCard = Race & { status: RaceStatus; watched: boolean };

/**
 * Everything the F1 tab shows: the next weekend, the calendar, the latest
 * results you may see, and the standings as of then.
 */
export async function f1Board(userId: number | null, shield: boolean, now = new Date()) {
  const races = await season();
  const year = races[0]?.season ?? now.getUTCFullYear();
  const watched = watchedRounds(userId, year);
  const cards: RaceCard[] = races.map((r) => ({ ...r, status: statusOf(r, races, now), watched: watched.has(r.round) }));

  const done = cards.filter((r) => r.status === "done").map((r) => r.round);
  const latest = done.length ? Math.max(...done) : null;
  const shown = revealedRound(done, watched, shield);

  const [results, standings] = await Promise.all([
    latest !== null && (!shield || watched.has(latest)) ? roundResults(year, latest) : null,
    shown !== null ? standingsAfter(year, shown) : null,
  ]);

  return {
    season: year,
    watch: WATCH,
    shield,
    next: cards.find((r) => r.status === "live" || r.status === "next") ?? null,
    races: cards,
    latest: latest === null ? null : {
      round: latest,
      name: cards.find((r) => r.round === latest)!.name,
      /** Null while the shield covers it. */
      results,
    },
    standings: standings && shown !== null ? { afterRound: shown, ...standings } : null,
  };
}

/** One round: its sessions, and its results if they may be shown. */
export async function f1Round(userId: number | null, shield: boolean, round: number, now = new Date()) {
  const races = await season();
  const race = races.find((r) => r.round === round);
  if (!race) return null;
  const watched = watchedRounds(userId, race.season).has(round);
  const status = statusOf(race, races, now);
  const revealed = status === "done" && (!shield || watched);
  return {
    ...race,
    status,
    watched,
    watch: WATCH,
    results: revealed ? await roundResults(race.season, round) : null,
  };
}

/** The sessions worth a notification over the coming weeks: qualifying, sprint and race. */
export async function upcomingSessions(days = 21, now = new Date()) {
  const races = await season().catch(() => [] as Race[]);
  const horizon = now.getTime() + days * 86400_000;
  return races.flatMap((r) =>
    r.sessions
      .filter((s) => s.kind === "quali" || s.kind === "sprint" || s.kind === "race")
      .filter((s) => Date.parse(s.at) > now.getTime() && Date.parse(s.at) < horizon)
      .map((s) => ({ round: r.round, race: r.name, kind: s.kind, label: s.label, at: s.at })),
  );
}
