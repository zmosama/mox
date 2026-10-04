/**
 * MOX's own catalogue of films, series and people.
 *
 * Everything TMDB tells us about a title or a person is kept here, for good:
 * a search result, a studio's list, a person's work, a title someone opened.
 * The first time is a request to TMDB; after that the answer comes from here,
 * and TMDB is asked again only once the record is old for what it is — six
 * hours for a series still airing or a film just out, a month for a finished
 * series or an old film. If TMDB cannot be reached, the old record is served
 * rather than an error.
 *
 * What is NOT kept here is where a title streams: that changes weekly, so it
 * is still asked for on its own, through the short-lived disk cache.
 *
 * Each night the refresh also opens the most popular titles that have only
 * ever been seen in a list, so the catalogue fills with full records — cast,
 * studios, certificates, IMDb ids — and not just names and posters.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MediaKind } from "@/db/schema";
import { ageLevel, certAppend, type AgeLevel, type CertSource } from "./ratings";
import { tmdb } from "./tmdb";
import { topImdbTitles } from "./imdb";

const HOUR = 3600;
const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);
const key = (tmdbId: number, kind: MediaKind) => `${tmdbId}:${kind}`;

/** A title as any TMDB list gives it: search, discover, a person's credits. */
export type ListedTitle = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
};

/** A person as a list gives them. */
export type ListedPerson = {
  id: number;
  name?: string;
  profile_path?: string | null;
  known_for_department?: string;
  popularity?: number;
};

const blank = (s: string | undefined | null) => (s ? s : null);

function lightRow(t: ListedTitle, kind: MediaKind) {
  const date = blank(t.release_date ?? t.first_air_date);
  return {
    tmdbId: t.id,
    kind,
    title: blank(t.title ?? t.name),
    originalTitle: blank(t.original_title ?? t.original_name),
    year: date ? Number(date.slice(0, 4)) || null : null,
    releaseDate: date,
    posterPath: t.poster_path ?? null,
    backdropPath: t.backdrop_path ?? null,
    overview: blank(t.overview),
    rating: t.vote_average ?? null,
    votes: t.vote_count ?? null,
    popularity: t.popularity ?? null,
    lang: blank(t.original_language),
    seenAt: now(),
  };
}

/* On meeting a title again, what the list says replaces what was there — it
   is newer — but never with nothing: a list without an overview does not
   erase the one the full record gave. */
const keep = (column: string) => sql.raw(`coalesce(excluded.${column}, ${column})`);
const LIGHT_UPDATE = {
  title: keep("title"),
  originalTitle: keep("original_title"),
  year: keep("year"),
  releaseDate: keep("release_date"),
  posterPath: keep("poster_path"),
  backdropPath: keep("backdrop_path"),
  overview: keep("overview"),
  rating: keep("rating"),
  votes: keep("votes"),
  popularity: keep("popularity"),
  lang: keep("lang"),
  seenAt: sql.raw("excluded.seen_at"),
};

/** Keep every title in a list TMDB returned. Cheap: one transaction, no requests. */
export function rememberTitles(items: { item: ListedTitle; kind: MediaKind }[]) {
  const rows = items.filter((i) => i.item?.id).map((i) => lightRow(i.item, i.kind));
  if (!rows.length) return;
  try {
    db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(schema.catalogTitles)
          .values(row)
          .onConflictDoUpdate({ target: [schema.catalogTitles.tmdbId, schema.catalogTitles.kind], set: LIGHT_UPDATE })
          .run();
      }
    });
  } catch {
    // Remembering is a side effect: it must never fail the page that asked.
  }
}

/** Keep every person in a list TMDB returned. */
export function rememberPeople(people: ListedPerson[]) {
  const rows = people.filter((p) => p?.id && p.name);
  if (!rows.length) return;
  try {
    db.transaction((tx) => {
      for (const p of rows) {
        tx.insert(schema.catalogPeople)
          .values({
            id: p.id,
            name: p.name!,
            profilePath: p.profile_path ?? null,
            department: blank(p.known_for_department),
            popularity: p.popularity ?? null,
            seenAt: now(),
          })
          .onConflictDoUpdate({
            target: schema.catalogPeople.id,
            set: {
              name: sql.raw("excluded.name"),
              profilePath: keep("profile_path"),
              department: keep("department"),
              popularity: keep("popularity"),
              seenAt: sql.raw("excluded.seen_at"),
            },
          })
          .run();
      }
    });
  } catch {
    // As above.
  }
}

// ---------------------------------------------------------------- titles

/** How long a full record is good for, by what the title is. */
export function maxAge(kind: MediaKind, status: string | null, releaseDate: string | null, today = new Date()): number {
  if (kind === "tv") return status === "Ended" || status === "Canceled" ? 30 * DAY : 6 * HOUR;
  if (!releaseDate) return 6 * HOUR;
  const days = (today.getTime() - Date.parse(releaseDate)) / 86_400_000;
  // Just out or still to come: dates, certificates and credits still move.
  return days < 120 ? 6 * HOUR : 30 * DAY;
}

const KEPT_JOBS = new Set([
  "Director", "Screenplay", "Writer", "Story", "Novel", "Creator", "Producer",
  "Executive Producer", "Original Music Composer", "Director of Photography", "Editor",
]);

type Detail = Record<string, unknown> & CertSource & {
  title?: string;
  name?: string;
  status?: string;
  release_date?: string;
  first_air_date?: string;
  genres?: { id: number; name: string }[];
  production_companies?: { id: number; name: string }[];
  networks?: { id: number; name: string }[];
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  credits?: { cast?: { order?: number }[]; crew?: { job?: string }[] };
  videos?: { results?: { site?: string; type?: string }[] };
};

/** The full record, less what nothing reads: a long series' credits run to hundreds of names. */
function trim(d: Detail): Detail {
  return {
    ...d,
    credits: d.credits
      ? {
          cast: (d.credits.cast ?? []).slice(0, 40),
          crew: (d.credits.crew ?? []).filter((c) => KEPT_JOBS.has(c.job ?? "")).slice(0, 80),
        }
      : undefined,
    // Trailers and teasers only: a famous film has dozens of featurettes ahead of them.
    videos: d.videos
      ? { results: (d.videos.results ?? []).filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")).slice(0, 12) }
      : undefined,
  };
}

function saveDetail(kind: MediaKind, tmdbId: number, d: Detail) {
  const level = ageLevel(kind, d);
  const light = lightRow({ ...(d as ListedTitle), id: tmdbId }, kind);
  const full = {
    ...light,
    genres: JSON.stringify((d.genres ?? []).map((g) => g.name)),
    companies: JSON.stringify((d.production_companies ?? []).map((c) => c.id)),
    networks: JSON.stringify((d.networks ?? []).map((n) => n.id)),
    imdbId: blank(d.external_ids?.imdb_id ?? d.imdb_id),
    status: blank(d.status),
    ageLevel: level,
    ageCheckedAt: now(),
    detail: JSON.stringify(trim(d)),
    detailAt: now(),
  };
  try {
    db.insert(schema.catalogTitles)
      .values(full)
      .onConflictDoUpdate({ target: [schema.catalogTitles.tmdbId, schema.catalogTitles.kind], set: full })
      .run();
  } catch {
    // Served all the same; it is fetched again next time.
  }
}

/**
 * A title's full record: credits, videos, certificates, studios and its IMDb
 * id, from the catalogue while it is fresh, from TMDB (and then kept) when
 * not. `force` skips the catalogue, for the nightly enrichment.
 */
export async function titleDetail<T = Detail>(kind: MediaKind, tmdbId: number, opts: { force?: boolean } = {}): Promise<T> {
  const row = db
    .select({
      detail: schema.catalogTitles.detail,
      detailAt: schema.catalogTitles.detailAt,
      status: schema.catalogTitles.status,
      releaseDate: schema.catalogTitles.releaseDate,
    })
    .from(schema.catalogTitles)
    .where(and(eq(schema.catalogTitles.tmdbId, tmdbId), eq(schema.catalogTitles.kind, kind)))
    .get();

  if (row?.detail && row.detailAt && !opts.force && now() - row.detailAt < maxAge(kind, row.status, row.releaseDate)) {
    return JSON.parse(row.detail) as T;
  }
  try {
    const d = await tmdb<Detail>(`/${kind}/${tmdbId}`, {
      append_to_response: `credits,videos,external_ids,${certAppend(kind)}`,
    });
    saveDetail(kind, tmdbId, d);
    return trim(d) as T;
  } catch (e) {
    // TMDB down or slow: an old record beats an error page.
    if (row?.detail) return JSON.parse(row.detail) as T;
    throw e;
  }
}

/** The full record plus where it streams, which is asked for on its own and never kept long. */
export async function titleWithProviders<T = Detail>(kind: MediaKind, tmdbId: number): Promise<T> {
  const [detail, providers] = await Promise.all([
    titleDetail<T>(kind, tmdbId),
    tmdb<{ results?: unknown }>(`/${kind}/${tmdbId}/watch/providers`).catch(() => ({ results: undefined })),
  ]);
  return { ...detail, "watch/providers": providers };
}

/** Certificates already known, by "id:kind". */
export function knownAgeLevels(refs: { tmdbId: number; kind: MediaKind }[]) {
  const out = new Map<string, AgeLevel | null>();
  for (const kind of ["movie", "tv"] as const) {
    const ids = [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.tmdbId))];
    if (!ids.length) continue;
    for (const row of db
      .select({ tmdbId: schema.catalogTitles.tmdbId, level: schema.catalogTitles.ageLevel, checked: schema.catalogTitles.ageCheckedAt })
      .from(schema.catalogTitles)
      .where(and(eq(schema.catalogTitles.kind, kind), inArray(schema.catalogTitles.tmdbId, ids)))
      .all()) {
      if (row.checked !== null) out.set(key(row.tmdbId, kind), (row.level as AgeLevel | null) ?? null);
    }
  }
  return out;
}

/** Keep a certificate looked up for the age filter, so it is never asked for twice. */
export function rememberAgeLevel(tmdbId: number, kind: MediaKind, level: AgeLevel | null) {
  try {
    db.insert(schema.catalogTitles)
      .values({ tmdbId, kind, ageLevel: level, ageCheckedAt: now() })
      .onConflictDoUpdate({
        target: [schema.catalogTitles.tmdbId, schema.catalogTitles.kind],
        set: { ageLevel: level, ageCheckedAt: now() },
      })
      .run();
  } catch {
    // Looked up again next time.
  }
}

/** Titles in the catalogue, light fields only, for lists that start from ids. */
export function catalogued(refs: { tmdbId: number; kind: MediaKind }[]) {
  const out = new Map<string, typeof schema.catalogTitles.$inferSelect>();
  const ids = [...new Set(refs.map((r) => r.tmdbId))];
  if (!ids.length) return out;
  for (const row of db.select().from(schema.catalogTitles).where(inArray(schema.catalogTitles.tmdbId, ids)).all()) {
    out.set(key(row.tmdbId, row.kind), row);
  }
  return out;
}

// ---------------------------------------------------------------- people

const PERSON_AGE = 7 * DAY;

/** A person with all their work, from the catalogue for a week at a time. Their credits are kept as titles too. */
export async function personDetail<T extends { id: number; name: string }>(
  id: number,
  fetch: () => Promise<T & { profile_path?: string | null; known_for_department?: string; popularity?: number; external_ids?: { imdb_id?: string | null }; imdb_id?: string | null; combined_credits?: { cast?: (ListedTitle & { media_type?: string })[]; crew?: (ListedTitle & { media_type?: string })[] } }>,
): Promise<T> {
  const row = db
    .select({ detail: schema.catalogPeople.detail, detailAt: schema.catalogPeople.detailAt })
    .from(schema.catalogPeople)
    .where(eq(schema.catalogPeople.id, id))
    .get();
  if (row?.detail && row.detailAt && now() - row.detailAt < PERSON_AGE) return JSON.parse(row.detail) as T;

  try {
    const p = await fetch();
    const values = {
      id,
      name: p.name,
      profilePath: p.profile_path ?? null,
      department: blank(p.known_for_department),
      popularity: p.popularity ?? null,
      imdbId: blank(p.external_ids?.imdb_id ?? p.imdb_id),
      detail: JSON.stringify(p),
      detailAt: now(),
      seenAt: now(),
    };
    try {
      db.insert(schema.catalogPeople).values(values).onConflictDoUpdate({ target: schema.catalogPeople.id, set: values }).run();
    } catch {
      // As with titles: served regardless.
    }
    const credits = [...(p.combined_credits?.cast ?? []), ...(p.combined_credits?.crew ?? [])];
    rememberTitles(
      credits
        .filter((c) => c.media_type === "movie" || c.media_type === "tv")
        .map((c) => ({ item: c, kind: c.media_type as MediaKind })),
    );
    return p;
  } catch (e) {
    if (row?.detail) return JSON.parse(row.detail) as T;
    throw e;
  }
}

// ---------------------------------------------------------------- nightly

/**
 * Open the most popular titles the catalogue has only seen in lists, so they
 * gain their full record, and renew full records gone stale. A few hundred a
 * night is a few minutes of TMDB's time and fills the catalogue steadily.
 */
export async function enrichCatalog(limit = 400): Promise<{ filled: number; failed: number }> {
  // What somebody here rated first — those are the titles the taste model and
  // the friends tab read — then the most popular.
  const rows = db
    .select({ tmdbId: schema.catalogTitles.tmdbId, kind: schema.catalogTitles.kind })
    .from(schema.catalogTitles)
    .where(isNull(schema.catalogTitles.detailAt))
    .orderBy(
      sql`case when exists (select 1 from verdicts v where v.tmdb_id = ${schema.catalogTitles.tmdbId} and v.kind = ${schema.catalogTitles.kind}) then 0 else 1 end`,
      sql`${schema.catalogTitles.popularity} desc nulls last`,
    )
    .limit(limit)
    .all();
  let filled = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await titleDetail(r.kind, r.tmdbId, { force: true });
      filled++;
    } catch {
      failed++;
    }
  }
  return { filled, failed };
}

/**
 * Bring in what MOX already knew before the catalogue existed: the curated
 * titles, and every title anybody rated. Idempotent — rows already there are
 * left alone — so it runs every night and costs nothing after the first.
 */
export function seedCatalog(): number {
  const before = catalogSize().titles;
  db.run(sql`
    insert or ignore into catalog_titles
      (tmdb_id, kind, title, year, release_date, poster_path, backdrop_path, overview, rating, votes, lang,
       age_level, age_checked_at)
    select tmdb_id, kind, title, year, release_date,
      -- Stored as full URLs there; the catalogue keeps TMDB's paths.
      case when poster like 'https://image.tmdb.org/t/p/%' then substr(poster, instr(substr(poster, 29), '/') + 28) end,
      case when backdrop like 'https://image.tmdb.org/t/p/%' then substr(backdrop, instr(substr(backdrop, 29), '/') + 28) end,
      overview, rating, votes, lang, age_level, age_checked_at
    from titles`);
  db.run(sql`insert or ignore into catalog_titles (tmdb_id, kind) select distinct tmdb_id, kind from verdicts`);
  return catalogSize().titles - before;
}

/**
 * Find IMDb's most-voted titles on TMDB, the ones not settled yet, and keep
 * each in the catalogue with its IMDb id — so the catalogue fills from the
 * titles that matter most, not just from what somebody happened to search.
 * The nightly enrichment then gives them full records.
 */
export async function mapImdb(limit = 1000): Promise<{ found: number; missing: number; failed: number }> {
  const settled = new Set<string>([
    ...db.select({ id: schema.imdbMap.imdbId }).from(schema.imdbMap).all().map((r) => r.id),
    ...db
      .select({ id: schema.catalogTitles.imdbId })
      .from(schema.catalogTitles)
      .where(sql`${schema.catalogTitles.imdbId} is not null`)
      .all()
      .map((r) => r.id!),
  ]);
  const todo = topImdbTitles(settled, limit);
  let found = 0;
  let missing = 0;
  let failed = 0;

  // Four at a time: well inside TMDB's limits, and a few minutes for a thousand.
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (t) => {
        try {
          const res = await tmdb<{ movie_results?: ListedTitle[]; tv_results?: ListedTitle[] }>(`/find/${t.tconst}`, {
            external_source: "imdb_id",
          });
          const series = t.type === "tvSeries" || t.type === "tvMiniSeries";
          const kind: MediaKind = series ? "tv" : "movie";
          const hit = (series ? res.tv_results : res.movie_results)?.[0];
          db.insert(schema.imdbMap)
            .values({ imdbId: t.tconst, tmdbId: hit?.id ?? null, kind: hit ? kind : null, checkedAt: now() })
            .onConflictDoUpdate({ target: schema.imdbMap.imdbId, set: { tmdbId: hit?.id ?? null, kind: hit ? kind : null, checkedAt: now() } })
            .run();
          if (!hit) {
            missing++;
            return;
          }
          rememberTitles([{ item: hit, kind }]);
          db.update(schema.catalogTitles)
            .set({ imdbId: t.tconst })
            .where(and(eq(schema.catalogTitles.tmdbId, hit.id), eq(schema.catalogTitles.kind, kind)))
            .run();
          found++;
        } catch {
          failed++;
        }
      }),
    );
  }
  return { found, missing, failed };
}

/** How big the catalogue is, for the refresh log. */
export function catalogSize() {
  const titles = db.select({ n: sql<number>`count(*)`, full: sql<number>`count(detail_at)` }).from(schema.catalogTitles).get();
  const people = db.select({ n: sql<number>`count(*)`, full: sql<number>`count(detail_at)` }).from(schema.catalogPeople).get();
  return { titles: titles?.n ?? 0, fullTitles: titles?.full ?? 0, people: people?.n ?? 0, fullPeople: people?.full ?? 0 };
}
