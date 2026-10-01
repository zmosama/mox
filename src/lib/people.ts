/**
 * Actors and directors: who they are, what they made, what of it you can
 * watch tonight, and the people you follow or keep coming back to.
 *
 * Everything comes from TMDB through the disk-cached client, so a person seen
 * once is quick the next time. Where a work streams in Egypt is the one
 * expensive part — a request per title — so it is asked only for the titles
 * that matter most, and everything already in the catalog is answered from
 * the local availability table.
 */
import { findFor, playUrl } from "./play-links";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CardTitle } from "@/components/TitleCard";
import { addDaysISO, todayISO } from "./dates";
import { includedOn, isStore, type WatchProviders } from "./providers";
import { availabilityFor, serviceLookup, tasteFor, verdictsFor } from "./queries";
import { posterPath, region, tmdb } from "./tmdb";
import type { MediaKind, Verdict } from "@/db/schema";

/** How many of a person's works get a live "where does it stream" lookup. */
const PROVIDER_LOOKUPS = 40;

export type PersonRef = {
  id: number;
  name: string;
  profile: string | null;
  /** "Acting", "Directing", "Writing"… */
  department: string | null;
};

export type PersonCredit = CardTitle & {
  date: string;
  /** "Eddie Brock", or "Director" — every role they had on it, joined. */
  role: string;
  /** Acting or crew, for the Actor / Director switch. */
  as: "acting" | "crew";
  popularity: number;
};

export type PersonDetail = PersonRef & {
  birthday: string | null;
  deathday: string | null;
  place: string | null;
  bio: string | null;
  credits: PersonCredit[];
  following: boolean;
};

type RawCredit = {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  character?: string;
  job?: string;
  genre_ids?: number[];
};

export type RawPerson = {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  biography?: string;
  combined_credits?: { cast?: RawCredit[]; crew?: RawCredit[] };
};

/** A name in the credits is not always work on the film. */
const NOT_A_JOB = new Set(["Thanks", "Special Thanks", "In Memory Of", "Dedicated To", "Archive Footage"]);

/** Talk, news and reality: appearances, not work. */
const NOT_WORK = new Set([10767, 10763, 10764]);
const SELF = /\b(self|himself|herself|themselves)\b/i;

export const profileUrl = (path: string | null | undefined, size = "w185") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

/** The services this viewer pays for — every subscription if they haven't said. */
export function chosenServices(userId: number | null) {
  const configured = db.select().from(schema.services).orderBy(schema.services.priority).all();
  const picked = userId
    ? new Set(
        db
          .select({ providerId: schema.userServices.providerId })
          .from(schema.userServices)
          .where(eq(schema.userServices.userId, userId))
          .all()
          .map((r) => r.providerId),
      )
    : new Set<number>();
  return configured.filter((s) => !isStore(s.providerId) && (picked.size === 0 || picked.has(s.providerId)));
}

async function rawPerson(id: number): Promise<RawPerson> {
  return tmdb<RawPerson>(`/person/${id}`, { append_to_response: "combined_credits" });
}

/** Every work, one entry per title, with all their roles on it. Exported for tests. */
export function creditsOf(p: RawPerson): Omit<PersonCredit, "verdict" | "platforms">[] {
  const byTitle = new Map<string, Omit<PersonCredit, "verdict" | "platforms"> & { roles: Set<string> }>();
  const add = (c: RawCredit, role: string | undefined, as: "acting" | "crew") => {
    if (c.media_type !== "movie" && c.media_type !== "tv") return;
    if (c.genre_ids?.some((g) => NOT_WORK.has(g))) return;
    if (as === "acting" && role && SELF.test(role)) return;
    const k = `${c.media_type}:${c.id}`;
    const date = c.release_date || c.first_air_date || "";
    const existing = byTitle.get(k);
    if (existing) {
      if (role) existing.roles.add(role);
      // Acting wins: someone who starred in and produced a film is in it.
      if (as === "acting") existing.as = "acting";
      return;
    }
    byTitle.set(k, {
      tmdbId: c.id,
      kind: c.media_type,
      title: c.title ?? c.name ?? "Untitled",
      year: date ? Number(date.slice(0, 4)) : null,
      poster: posterPath(c.poster_path),
      rating: c.vote_count && c.vote_count > 20 && c.vote_average ? Math.round(c.vote_average * 10) / 10 : null,
      date,
      role: "",
      as,
      popularity: c.popularity ?? 0,
      roles: new Set(role ? [role] : []),
    });
  };
  for (const c of p.combined_credits?.cast ?? []) add(c, c.character, "acting");
  for (const c of p.combined_credits?.crew ?? []) if (!NOT_A_JOB.has(c.job ?? "")) add(c, c.job, "crew");
  return [...byTitle.values()].map(({ roles, ...c }) => ({ ...c, role: [...roles].filter(Boolean).join(", ") }));
}

/** Where each of these streams on the viewer's services, looking up the ones the catalog doesn't know. */
async function platformsFor(
  credits: { tmdbId: number; kind: MediaKind; title: string; popularity: number }[],
  userId: number | null,
) {
  const lookup = serviceLookup();
  const local = availabilityFor(credits.map((c) => c.tmdbId), userId);
  const chosen = chosenServices(userId);
  const out = new Map<string, CardTitle["platforms"]>();

  const toPlatforms = (
    names: { name: string; deepLink?: string | null }[],
    title: string,
    kind: MediaKind,
  ) =>
    names.map(({ name, deepLink }) => {
      const row = lookup.get(name);
      return {
        name,
        logo: row?.logo ?? null,
        url: playUrl(row?.providerId, title, deepLink),
        find: deepLink ? null : findFor(row?.providerId, title, kind),
      };
    });

  const unknown: typeof credits = [];
  for (const c of credits) {
    const rows = local.get(`${c.tmdbId}:${c.kind}`);
    if (rows?.length) out.set(`${c.kind}:${c.tmdbId}`, toPlatforms(rows, c.title, c.kind));
    else unknown.push(c);
  }

  const worth = [...unknown].sort((a, b) => b.popularity - a.popularity).slice(0, PROVIDER_LOOKUPS);
  await Promise.all(
    worth.map(async (c) => {
      try {
        const wp = await tmdb<{ results?: WatchProviders }>(`/${c.kind}/${c.tmdbId}/watch/providers`);
        const names = includedOn(wp.results, chosen, region());
        if (names.length) out.set(`${c.kind}:${c.tmdbId}`, toPlatforms(names.map((name) => ({ name })), c.title, c.kind));
      } catch {
        // a missing badge is better than a missing page
      }
    }),
  );
  return out;
}

export async function personDetail(id: number, userId: number | null): Promise<PersonDetail> {
  const p = await rawPerson(id);
  const credits = creditsOf(p);
  const platforms = await platformsFor(credits, userId);
  const verdicts = userId ? verdictsFor(userId) : new Map<string, Verdict>();

  const following = userId
    ? Boolean(
        db
          .select()
          .from(schema.followedPeople)
          .where(and(eq(schema.followedPeople.userId, userId), eq(schema.followedPeople.personId, id)))
          .get(),
      )
    : false;

  return {
    id: p.id,
    name: p.name,
    profile: profileUrl(p.profile_path, "w342"),
    department: p.known_for_department ?? null,
    birthday: p.birthday ?? null,
    deathday: p.deathday ?? null,
    place: p.place_of_birth ?? null,
    bio: p.biography?.trim() || null,
    following,
    credits: credits
      .map((c) => ({
        ...c,
        verdict: verdicts.get(`${c.tmdbId}:${c.kind}`) ?? null,
        platforms: platforms.get(`${c.kind}:${c.tmdbId}`) ?? [],
      }))
      // Newest first; undated (announced, not yet scheduled) at the very top.
      .sort((a, b) => (b.date || "9999").localeCompare(a.date || "9999")),
  };
}

/**
 * The answer if it comes in time, otherwise the fallback. For the extras on a
 * page — work from followed people, the people you love — that must not hold
 * the page itself: what was slow this time is cached for the next.
 */
export function within<T>(ms: number, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------- following

export function followedPeople(userId: number): PersonRef[] {
  return db
    .select()
    .from(schema.followedPeople)
    .where(eq(schema.followedPeople.userId, userId))
    .orderBy(desc(schema.followedPeople.addedAt))
    .all()
    .map((r) => ({ id: r.personId, name: r.name, profile: r.profile, department: null }));
}

export function setFollowingPerson(userId: number, person: { id: number; name: string; profile: string | null }, following: boolean) {
  const t = schema.followedPeople;
  if (following) {
    db.insert(t)
      .values({ userId, personId: person.id, name: person.name, profile: person.profile })
      .onConflictDoUpdate({ target: [t.userId, t.personId], set: { name: person.name, profile: person.profile } })
      .run();
  } else {
    db.delete(t).where(and(eq(t.userId, userId), eq(t.personId, person.id))).run();
  }
}

export type PersonNews = { person: PersonRef; title: PersonCredit };

/**
 * New work from the people you follow that has reached one of your services:
 * released in the last six weeks, or a series of theirs that premiered then.
 */
export async function newFromPeople(userId: number, today = todayISO()): Promise<PersonNews[]> {
  const people = followedPeople(userId).slice(0, 30);
  if (!people.length) return [];
  const since = addDaysISO(today, -42);
  const verdicts = verdictsFor(userId);

  const found = await Promise.all(
    people.map(async (person) => {
      try {
        const recent = creditsOf(await rawPerson(person.id)).filter((c) => c.date >= since && c.date <= today);
        if (!recent.length) return [];
        const platforms = await platformsFor(recent, userId);
        return recent
          .map((c) => ({
            person,
            title: {
              ...c,
              verdict: verdicts.get(`${c.tmdbId}:${c.kind}`) ?? null,
              platforms: platforms.get(`${c.kind}:${c.tmdbId}`) ?? [],
            },
          }))
          .filter((n) => n.title.platforms.length && n.title.verdict !== "hidden" && n.title.verdict !== "seen");
      } catch {
        return [];
      }
    }),
  );

  // One card per title, even when two people you follow are both in it.
  const seen = new Set<string>();
  return found
    .flat()
    .sort((a, b) => b.title.date.localeCompare(a.title.date))
    .filter((n) => {
      const k = `${n.title.kind}:${n.title.tmdbId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// ---------------------------------------------------------------- taste

/**
 * The people who keep turning up in what you rated well, strongest first,
 * each resolved to a TMDB person for a face and a page.
 */
export async function peopleYouLove(userId: number, limit = 10): Promise<(PersonRef & { seen: number })[]> {
  const model = tasteFor(userId);
  const names = model?.strongest("person", 3, limit) ?? [];
  const found = await Promise.all(
    names.map(async ({ value, seen }) => {
      try {
        const res = await tmdb<{ results?: { id: number; name: string; profile_path: string | null; known_for_department?: string }[] }>(
          "/search/person",
          { query: value },
        );
        const hit = res.results?.find((r) => r.name.toLowerCase() === value.toLowerCase()) ?? res.results?.[0];
        return hit
          ? { id: hit.id, name: hit.name, profile: profileUrl(hit.profile_path), department: hit.known_for_department ?? null, seen }
          : null;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((p): p is PersonRef & { seen: number } => p !== null);
}
