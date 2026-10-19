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
import circuits from "./f1-circuits.json";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Crop, imagePath } from "./f1-images";
import { wikiSummary } from "./wiki";

const BASE = "https://api.jolpi.ca/ergast/f1";

/** Where the races are shown here. The owner watches on TOD. */
export const WATCH = { name: "TOD", url: "https://www.tod.tv/" };

// ------------------------------------------------------------------ types

export type SessionKind = "fp1" | "fp2" | "fp3" | "sprintQuali" | "sprint" | "quali" | "race";

export type Session = { kind: SessionKind; label: string; at: string };

/** A circuit's outline in a box at most 1000 across, start/finish first. */
export type Track = { w: number; h: number; points: [number, number][]; length: number; firstGp: number };

export type Race = {
  season: number;
  round: number;
  name: string;
  circuit: string;
  track: Track | null;
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
  /** Jolpica's ids, for the driver's and the team's own pages. */
  driverId: string;
  teamId: string;
  code: string | null;
  number: string | null;
  /** Where they started; null in qualifying, 0 from the pit lane. */
  grid: number | null;
  /** Fastest lap of the race. */
  fastest: boolean;
  /** The official headshot, filled in by `withPhotos`. */
  photo: string | null;
  team: string;
  /** The team's colour, "#rrggbb". */
  color: string;
  /** Finishing time, gap, "+1 Lap", or why they stopped. */
  detail: string;
  points: number;
};

export type Standing = {
  position: number;
  /** The driver's or the team's Jolpica id. */
  id: string;
  code: string | null;
  photo: string | null;
  name: string;
  team: string | null;
  color: string;
  points: number;
  wins: number;
};

/** Each team's livery colour, matched on a word of its name. */
const TEAM_COLORS: [string, string][] = [
  ["mclaren", "#F47600"],
  ["ferrari", "#ED1131"],
  ["mercedes", "#00D7B6"],
  ["rb f1", "#6C98FF"],
  ["racing bulls", "#6C98FF"],
  ["red bull", "#4781D7"],
  ["aston", "#229971"],
  ["alpine", "#00A1E8"],
  ["williams", "#1868DB"],
  ["haas", "#9C9FA2"],
  ["audi", "#F50537"],
  ["sauber", "#52E252"],
  ["cadillac", "#909090"],
]

export function teamColor(team: string | null | undefined): string {
  const name = (team ?? "").toLowerCase();
  return TEAM_COLORS.find(([key]) => name.includes(key))?.[1] ?? "#8A8F98";
}

const TRACKS = circuits as unknown as Record<string, Track & { name: string }>;

function trackFor(circuitId: string): Track | null {
  const t = TRACKS[circuitId];
  return t ? { w: t.w, h: t.h, points: t.points, length: t.length, firstGp: t.firstGp } : null;
}

// ------------------------------------------------------------------ parsing

type JolpicaSession = { date: string; time?: string };
type JolpicaRace = {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: { circuitId?: string; circuitName: string; Location: { locality: string; country: string } };
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
    track: r.Circuit.circuitId ? trackFor(r.Circuit.circuitId) : null,
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

type JolpicaDriver = {
  driverId?: string;
  givenName: string;
  familyName: string;
  code?: string;
  permanentNumber?: string;
  url?: string;
  dateOfBirth?: string;
  nationality?: string;
};
type JolpicaConstructor = { constructorId?: string; name: string; url?: string; nationality?: string };

type JolpicaResult = {
  position?: string;
  positionText?: string;
  points?: string;
  status?: string;
  number?: string;
  grid?: string;
  Time?: { time?: string };
  FastestLap?: { rank?: string };
  Q3?: string;
  Q2?: string;
  Q1?: string;
  Driver: JolpicaDriver;
  Constructor: JolpicaConstructor;
};

export function parseResult(r: JolpicaResult): ResultRow {
  const position = Number(r.position ?? r.positionText);
  const grid = r.grid === undefined ? NaN : Number(r.grid);
  return {
    position: Number.isFinite(position) ? position : null,
    driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
    driverId: r.Driver.driverId ?? "",
    teamId: r.Constructor.constructorId ?? "",
    code: r.Driver.code ?? null,
    number: r.number ?? r.Driver.permanentNumber ?? null,
    grid: Number.isFinite(grid) ? grid : null,
    fastest: r.FastestLap?.rank === "1",
    photo: null,
    team: r.Constructor.name,
    color: teamColor(r.Constructor.name),
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
    const ask = async () => {
      await turn();
      return fetch(`${BASE}${path}`, {
        headers: { "user-agent": "mox (https://mox.mosama.me)" },
        signal: AbortSignal.timeout(8000),
      });
    };
    let res = await ask();
    // Over its rate limit: wait a moment and ask once more.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await ask();
    }
    if (!res.ok) throw new Error(`Jolpica answered ${res.status}`);
    const body = await res.json();
    cache.set(path, { at: Date.now(), body });
    return body as T;
  } catch (e) {
    if (hit) return hit.body as T;
    throw e;
  }
}

/** Jolpica allows four requests a second; a page that needs more waits its turn. */
const started: number[] = [];
async function turn() {
  for (;;) {
    const now = Date.now();
    while (started.length && now - started[0] > 1000) started.shift();
    if (started.length < 4) {
      started.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000 - (now - started[0]) + 5));
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

/**
 * The top three of every finished round this season, by round: three
 * requests for the whole season rather than three per race.
 */
export async function seasonPodiums(year: number): Promise<Map<number, ResultRow[]>> {
  const podiums = new Map<number, ResultRow[]>();
  await Promise.all(
    [1, 2, 3].map(async (place) => {
      try {
        const body = await jolpica<RaceTable<WithResults>>(`/${year}/results/${place}.json?limit=40`, 20 * 60);
        for (const race of body.MRData.RaceTable.Races) {
          const row = race.Results?.[0];
          if (!row) continue;
          const round = Number(race.round);
          podiums.set(round, [...(podiums.get(round) ?? []), parseResult(row)]);
        }
      } catch {
        // A missing step of the podium is left out, not guessed.
      }
    }),
  );
  for (const rows of podiums.values()) rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  return podiums;
}

type StandingsTable<S> = { MRData: { StandingsTable: { StandingsLists: S[] } } };

/** Drivers' and constructors' standings as they stood after `round`. */
export async function standingsAfter(year: number, round: number) {
  const ttl = 20 * 60;
  const [drivers, teams] = await Promise.all([
    jolpica<StandingsTable<{ DriverStandings: {
      position: string; points: string; wins: string;
      Driver: JolpicaDriver; Constructors: JolpicaConstructor[];
    }[] }>>(`/${year}/${round}/driverStandings.json?limit=40`, ttl)
      .then((b) => (b.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? []).map((d) => ({
        position: Number(d.position),
        id: d.Driver.driverId ?? "",
        code: d.Driver.code ?? null,
        photo: null as string | null,
        name: `${d.Driver.givenName} ${d.Driver.familyName}`,
        team: d.Constructors.at(-1)?.name ?? null,
        color: teamColor(d.Constructors.at(-1)?.name),
        points: Number(d.points),
        wins: Number(d.wins),
      })))
      .catch(() => [] as Standing[]),
    jolpica<StandingsTable<{ ConstructorStandings: {
      position: string; points: string; wins: string; Constructor: JolpicaConstructor;
    }[] }>>(`/${year}/${round}/constructorStandings.json?limit=40`, ttl)
      .then((b) => (b.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? []).map((c) => ({
        position: Number(c.position),
        id: c.Constructor.constructorId ?? "",
        code: null,
        photo: null as string | null,
        name: c.Constructor.name,
        team: null,
        color: teamColor(c.Constructor.name),
        points: Number(c.points),
        wins: Number(c.wins),
      })))
      .catch(() => [] as Standing[]),
  ]);
  return { drivers, teams };
}

/**
 * The official 2026 portraits, served from our own mirror (see f1-images.ts).
 * formula1.com files them by team and by its driver reference ("chalec01"),
 * which OpenF1 gives for everyone on the current grid, keyed by the
 * three-letter code Jolpica also uses. The list is kept on disk too, so the
 * photos still resolve on a day OpenF1 does not answer. Anyone older simply
 * has no photo.
 */
type Seat = { team: string; ref: string };
const GRID_FILE = join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "f1-images", "grid.json");
let grid: { at: number; byCode: Map<string, Seat> } | null = null;

async function portraits(): Promise<Map<string, Seat>> {
  if (grid && Date.now() - grid.at < 6 * 3600_000) return grid.byCode;
  try {
    const res = await fetch("https://api.openf1.org/v1/drivers?session_key=latest", {
      headers: { "user-agent": "mox (https://mox.mosama.me)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`OpenF1 answered ${res.status}`);
    const rows = (await res.json()) as { name_acronym?: string; team_name?: string; headshot_url?: string | null }[];
    const byCode = new Map<string, Seat>();
    for (const r of rows) {
      // ".../drivers/C/CHALEC01_Charles_Leclerc/chalec01.png..." → "chalec01"
      const ref = /\/([a-z]{6}\d{2})\.png/i.exec(r.headshot_url ?? "")?.[1]?.toLowerCase();
      const team = r.team_name?.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (r.name_acronym && ref && team) byCode.set(r.name_acronym, { team, ref });
    }
    if (!byCode.size) throw new Error("OpenF1 listed no drivers");
    grid = { at: Date.now(), byCode };
    await mkdir(dirname(GRID_FILE), { recursive: true });
    await writeFile(GRID_FILE, JSON.stringify(Object.fromEntries(byCode)));
  } catch {
    if (!grid) {
      // The last list we saved; OpenF1 is asked again in an hour.
      const saved = await readFile(GRID_FILE, "utf8")
        .then((t) => JSON.parse(t) as Record<string, Seat>)
        .catch(() => ({}) as Record<string, Seat>);
      grid = { at: Date.now() - 5 * 3600_000, byCode: new Map(Object.entries(saved)) };
    }
  }
  return grid.byCode;
}

/** A driver's 2026 portrait, cropped for where it is shown — a path on our server. */
export async function headshot(code: string | null | undefined, crop: Crop = "face") {
  const who = code ? (await portraits()).get(code) : undefined;
  return who ? imagePath(`portrait/${who.team}/${who.ref}/${crop}`) : null;
}

/** Every picture the current grid needs, for the nightly refresh to fetch ahead. */
export async function gridImageKeys(): Promise<string[]> {
  const seats = [...(await portraits()).values()];
  const teams = new Set([...Object.values(TEAM_SLUGS), ...seats.map((s) => s.team)]);
  return [
    ...seats.flatMap((s) => (["face", "half", "body"] as const).map((c) => `portrait/${s.team}/${s.ref}/${c}`)),
    ...[...teams].flatMap((t) => [`team/${t}/logo`, `team/${t}/car`]),
  ];
}

/** Jolpica's team id → the folder formula1.com files that team's 2026 art under. */
const TEAM_SLUGS: Record<string, string> = {
  mclaren: "mclaren", ferrari: "ferrari", red_bull: "redbullracing", mercedes: "mercedes",
  rb: "racingbulls", aston_martin: "astonmartin", haas: "haasf1team", alpine: "alpine",
  williams: "williams", audi: "audi", sauber: "audi", cadillac: "cadillac",
};

/** A team's white logo and its 2026 car, as formula1.com shows them, from our mirror; null for teams no longer racing. */
export function teamArt(id: string) {
  const slug = TEAM_SLUGS[id];
  if (!slug) return { logo: null, car: null };
  return { logo: imagePath(`team/${slug}/logo`), car: imagePath(`team/${slug}/car`) };
}

/** Fill in each driver row's headshot. */
export async function withPhotos<T extends { photo: string | null }>(rows: T[], codeOf: (row: T) => string | null): Promise<T[]> {
  return Promise.all(rows.map(async (row) => ({ ...row, photo: await headshot(codeOf(row)) })));
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

export type RaceCard = Race & {
  status: RaceStatus;
  watched: boolean;
  /** The top three, once finished and not behind the shield. */
  podium: ResultRow[] | null;
};

/**
 * Everything the F1 tab shows: the next weekend, the calendar, the latest
 * results you may see, and the standings as of then.
 */
export async function f1Board(userId: number | null, shield: boolean, now = new Date()) {
  const races = await season();
  const year = races[0]?.season ?? now.getUTCFullYear();
  const watched = watchedRounds(userId, year);
  const statuses = races.map((r) => statusOf(r, races, now));
  const anyDone = statuses.includes("done");
  const podiums = anyDone ? await seasonPodiums(year) : new Map<number, ResultRow[]>();
  const cards: RaceCard[] = races.map((r, i) => {
    const visible = statuses[i] === "done" && (!shield || watched.has(r.round));
    return {
      ...r,
      status: statuses[i],
      watched: watched.has(r.round),
      podium: visible ? (podiums.get(r.round) ?? null) : null,
    };
  });

  const done = cards.filter((r) => r.status === "done").map((r) => r.round);
  const latest = done.length ? Math.max(...done) : null;
  const shown = revealedRound(done, watched, shield);

  const [results, standings] = await Promise.all([
    latest !== null && (!shield || watched.has(latest)) ? roundResults(year, latest) : null,
    shown !== null ? standingsAfter(year, shown) : null,
  ]);

  const photoed = results && {
    race: await withPhotos(results.race, (r) => r.code),
    sprint: await withPhotos(results.sprint, (r) => r.code),
    quali: await withPhotos(results.quali, (r) => r.code),
  };
  const driverRows = standings ? await withPhotos(standings.drivers, (s) => s.code) : [];
  const photoStandings = standings && {
    drivers: driverRows,
    teams: standings.teams.map((t) => ({ ...t, photo: teamArt(t.id).logo })),
  };
  for (const card of cards) if (card.podium) card.podium = await withPhotos(card.podium, (r) => r.code);

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
      results: photoed,
    },
    standings: photoStandings && shown !== null ? { afterRound: shown, ...photoStandings } : null,
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
    results: revealed ? await photoResults(await roundResults(race.season, round)) : null,
  };
}

async function photoResults(r: { race: ResultRow[]; sprint: ResultRow[]; quali: ResultRow[] }) {
  return {
    race: await withPhotos(r.race, (x) => x.code),
    sprint: await withPhotos(r.sprint, (x) => x.code),
    quali: await withPhotos(r.quali, (x) => x.code),
  };
}

// ------------------------------------------------------------------ people

/**
 * World titles up to and including 2025. Jolpica only answers standings one
 * season at a time, so a career count would be one request per year raced;
 * this table is the answer instead. Add the champions each December.
 */
const DRIVER_TITLES: Record<string, number> = {
  hamilton: 7, michael_schumacher: 7, max_verstappen: 4, vettel: 4, prost: 4, alonso: 2, raikkonen: 1,
  button: 1, rosberg: 1, norris: 1,
};
const TEAM_TITLES: Record<string, number> = {
  ferrari: 16, mclaren: 10, williams: 9, mercedes: 8, red_bull: 6, renault: 2, brawn: 1,
};

type Total = { MRData: { total: string } };
const total = (path: string) =>
  jolpica<Total>(`${path}?limit=1`, 12 * 3600).then((b) => Number(b.MRData.total)).catch(() => null);

/** A round of this season from one driver's or one team's side. */
export type SeasonEntry = {
  round: number;
  name: string;
  /** The driver's finish, or for a team the better of its two cars. */
  position: number | null;
  grid: number | null;
  points: number;
  detail: string;
  driver: string;
};

/**
 * Their rounds this season, keeping to the shield: a round you have not
 * watched is left out, as its result would give the race away.
 */
async function seasonFor(kind: "drivers" | "constructors", id: string, userId: number | null, shield: boolean) {
  const races = await season();
  const year = races[0]?.season ?? new Date().getUTCFullYear();
  const watched = watchedRounds(userId, year);
  const body = await jolpica<RaceTable<WithResults>>(`/${year}/${kind}/${id}/results.json?limit=100`, 20 * 60).catch(
    () => null,
  );
  const entries: SeasonEntry[] = [];
  for (const race of body?.MRData.RaceTable.Races ?? []) {
    const round = Number(race.round);
    if (shield && !watched.has(round)) continue;
    const rows = (race.Results ?? []).map(parseResult);
    const best = rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99))[0];
    if (!best) continue;
    entries.push({
      round,
      name: race.raceName,
      position: best.position,
      grid: best.grid,
      points: rows.reduce((sum, r) => sum + r.points, 0),
      detail: best.detail,
      driver: best.driver,
    });
  }
  const done = races.filter((r) => statusOf(r, races, new Date()) === "done").map((r) => r.round);
  const shown = revealedRound(done, watched, shield);
  return { year, entries, standings: shown === null ? null : await standingsAfter(year, shown) };
}

/** A driver's page: who they are, their career in numbers, their season. */
export async function f1Driver(id: string, userId: number | null, shield: boolean) {
  if (!/^[a-z0-9_]+$/.test(id)) return null;
  const info = await jolpica<{ MRData: { DriverTable: { Drivers: JolpicaDriver[] } } }>(`/drivers/${id}.json`, 24 * 3600)
    .then((b) => b.MRData.DriverTable.Drivers[0])
    .catch(() => undefined);
  if (!info) return null;

  const year = (await season())[0]?.season ?? new Date().getUTCFullYear();
  const titles = DRIVER_TITLES[id] ?? 0;
  const [wiki, starts, wins, podium2, podium3, poles, own, teams] = await Promise.all([
    wikiSummary(info.url),
    total(`/drivers/${id}/results.json`),
    total(`/drivers/${id}/results/1.json`),
    total(`/drivers/${id}/results/2.json`),
    total(`/drivers/${id}/results/3.json`),
    total(`/drivers/${id}/qualifying/1.json`),
    seasonFor("drivers", id, userId, shield),
    // Who they drive for this year — no spoiler in that.
    jolpica<{ MRData: { ConstructorTable: { Constructors: JolpicaConstructor[] } } }>(
      `/${year}/drivers/${id}/constructors.json`,
      6 * 3600,
    )
      .then((b) => b.MRData.ConstructorTable.Constructors)
      .catch(() => [] as JolpicaConstructor[]),
  ]);
  const standing = own.standings?.drivers.find((d) => d.id === id) ?? null;
  const team = teams.at(-1) ?? null;
  const teamName = team?.name ?? standing?.team ?? null;
  const teamId = team?.constructorId ?? null;

  return {
    id,
    name: `${info.givenName} ${info.familyName}`,
    code: info.code ?? null,
    number: info.permanentNumber ?? null,
    nationality: info.nationality ?? null,
    born: info.dateOfBirth ?? null,
    team: teamName,
    teamId,
    color: teamColor(teamName),
    photo: await headshot(info.code, "body"),
    bio: wiki?.extract ?? null,
    wiki: wiki?.url ?? info.url ?? null,
    career: {
      starts,
      wins,
      podiums: wins === null || podium2 === null || podium3 === null ? null : wins + podium2 + podium3,
      poles,
      titles,
    },
    season: {
      year: own.year,
      position: standing?.position ?? null,
      points: standing?.points ?? null,
      wins: standing?.wins ?? null,
      rounds: own.entries,
    },
  };
}

/** A team's page: who they are, their drivers this year, their season. */
export async function f1Team(id: string, userId: number | null, shield: boolean) {
  if (!/^[a-z0-9_]+$/.test(id)) return null;
  const info = await jolpica<{ MRData: { ConstructorTable: { Constructors: JolpicaConstructor[] } } }>(
    `/constructors/${id}.json`,
    24 * 3600,
  )
    .then((b) => b.MRData.ConstructorTable.Constructors[0])
    .catch(() => undefined);
  if (!info) return null;

  const races = await season();
  const year = races[0]?.season ?? new Date().getUTCFullYear();
  const titles = TEAM_TITLES[id] ?? 0;
  const [wiki, starts, wins, own, lineup] = await Promise.all([
    wikiSummary(info.url),
    total(`/constructors/${id}/races.json`),
    total(`/constructors/${id}/results/1.json`),
    seasonFor("constructors", id, userId, shield),
    jolpica<{ MRData: { DriverTable: { Drivers: JolpicaDriver[] } } }>(`/${year}/constructors/${id}/drivers.json`, 6 * 3600)
      .then((b) => b.MRData.DriverTable.Drivers)
      .catch(() => [] as JolpicaDriver[]),
  ]);
  // Everyone who drove for them this year, stand-ins too; the pair they race
  // with now are the ones who drove their cars in the last race.
  const lastDone = races.filter((r) => statusOf(r, races, new Date()) === "done").at(-1)?.round;
  const entry = lastDone ? (await roundResults(year, lastDone)).race : [];
  const current = new Set(entry.filter((r) => r.teamId === id).map((r) => r.driverId));
  const drivers = await withPhotos(
    lineup.map((d) => ({
      current: current.has(d.driverId ?? ""),
      id: d.driverId ?? "",
      name: `${d.givenName} ${d.familyName}`,
      code: d.code ?? null,
      number: d.permanentNumber ?? null,
      photo: null as string | null,
    })),
    (d) => d.code,
  );
  drivers.sort((a, b) => Number(b.current) - Number(a.current));
  const seats = await Promise.all(drivers.map(async (d) => ({ ...d, portrait: await headshot(d.code, "half") })));
  const standing = own.standings?.teams.find((t) => t.id === id) ?? null;

  return {
    id,
    name: info.name,
    nationality: info.nationality ?? null,
    color: teamColor(info.name),
    /** The white logo, and the 2026 car side-on. */
    photo: teamArt(id).logo,
    car: teamArt(id).car,
    bio: wiki?.extract ?? null,
    wiki: wiki?.url ?? info.url ?? null,
    drivers: seats,
    career: { starts, wins, titles },
    season: {
      year: own.year,
      position: standing?.position ?? null,
      points: standing?.points ?? null,
      wins: standing?.wins ?? null,
      rounds: own.entries,
    },
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
