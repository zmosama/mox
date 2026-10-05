/**
 * The title's own page on each service, so Play opens the service's app on it.
 *
 * Every service's app opens a link to a title's page — they say so in their
 * apple-app-site-association files — and almost none open a search page:
 * of the search URLs in play-links.ts only Prime Video's reached its app; the
 * rest landed in Safari. So the Play button asks JustWatch, whose catalogue
 * TMDB's watch providers come from (the provider ids are the same numbers),
 * for each service's link to this title.
 *
 * Kept in MOX's database (`watch_links`), one row per title, and asked again
 * every night for every title on somebody's services, followed or wanted —
 * so a link a service changes, or a title arriving on a new service, is right
 * the next day. Anything else is asked for the first time it is opened, then
 * kept. A title JustWatch does not have, or an answer slower than two
 * seconds, falls back to the search URL, exactly as before.
 *
 * For some series a service's link is its first episode rather than the
 * series (TOD, OSN+): it still opens the right show in the right app.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MediaKind } from "@/db/schema";
import { region } from "./tmdb";

const ENDPOINT = "https://apis.justwatch.com/graphql";
/** A kept answer older than this is asked again when the title is opened. */
const FRESH = 2 * 86_400;
const now = () => Math.floor(Date.now() / 1000);

const QUERY = `query($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges { node { objectType ... on MovieOrShow {
      content(country: $country, language: $language) { externalIds { tmdbId } }
      offers(country: $country, platform: WEB) { monetizationType standardWebURL package { packageId } }
    } } }
  }
}`;

type Answer = {
  data?: {
    popularTitles?: {
      edges?: {
        node: {
          objectType?: string;
          content?: { externalIds?: { tmdbId?: string | null } };
          offers?: { monetizationType?: string; standardWebURL?: string; package?: { packageId?: number } }[];
        };
      }[];
    };
  };
};

/** Tracking parameters JustWatch adds; the service's link is the same without them. */
function clean(url: string): string {
  try {
    const u = new URL(url);
    for (const p of [...u.searchParams.keys()]) if (p.startsWith("utm_")) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url;
  }
}

/** JustWatch saying "too many requests": the night's asking stops there. */
class Throttled extends Error {}

/** JustWatch's answer, or null when it could not be asked — which is not the same as "none". */
async function ask(kind: MediaKind, tmdbId: number, title: string, opts: { throwOn429?: boolean } = {}): Promise<Map<number, string> | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { country: region(), language: "en", first: 5, filter: { searchQuery: title } },
      }),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (res.status === 429 && opts.throwOn429) throw new Throttled();
    if (!res.ok) return null;
    const body = (await res.json()) as Answer;
    // The search is by name; the match is by TMDB id and kind, so a remake
    // or a namesake is never taken for this title.
    const node = body.data?.popularTitles?.edges?.find(
      (e) =>
        e.node.content?.externalIds?.tmdbId === String(tmdbId) &&
        (e.node.objectType === "SHOW") === (kind === "tv"),
    )?.node;
    const links = new Map<number, string>();
    for (const o of node?.offers ?? []) {
      const id = o.package?.packageId;
      if (!id || !o.standardWebURL || links.has(id)) continue;
      links.set(id, clean(o.standardWebURL));
    }
    return links;
  } catch (e) {
    if (e instanceof Throttled) throw e;
    return null;
  }
}

function save(kind: MediaKind, tmdbId: number, links: Map<number, string>) {
  const values = { tmdbId, kind, links: JSON.stringify(Object.fromEntries(links)), checkedAt: now() };
  try {
    db.insert(schema.watchLinks)
      .values(values)
      .onConflictDoUpdate({ target: [schema.watchLinks.tmdbId, schema.watchLinks.kind], set: values })
      .run();
  } catch {
    // Asked again next time.
  }
}

const parse = (json: string) => new Map(Object.entries(JSON.parse(json) as Record<string, string>).map(([k, v]) => [Number(k), v]));

/** Each service's link to this title, by provider id: kept, or asked and kept. Empty when there is none. */
export async function watchLinks(kind: MediaKind, tmdbId: number, title: string): Promise<Map<number, string>> {
  const row = db
    .select()
    .from(schema.watchLinks)
    .where(and(eq(schema.watchLinks.tmdbId, tmdbId), eq(schema.watchLinks.kind, kind)))
    .get();
  if (row && now() - row.checkedAt < FRESH) return parse(row.links);
  const asked = await ask(kind, tmdbId, title);
  if (asked) save(kind, tmdbId, asked);
  // JustWatch unreachable: an older answer beats none.
  return asked ?? (row ? parse(row.links) : new Map());
}

/**
 * The nightly refresh: every title on somebody's services, followed or on a
 * watchlist, asked again — the ones asked longest ago first, one at a time
 * with a pause between. JustWatch turns away a server that asks faster: four
 * at once got 429 after a hundred titles. When it does, the night stops there
 * and the next night carries on from the oldest.
 */
export async function refreshWatchLinks(limit = 1500, pauseMs = 700): Promise<{ asked: number; withLinks: number; failed: number; throttled: boolean }> {
  const rows = db.all<{ tmdb_id: number; kind: MediaKind; title: string }>(sql`
    with wanted as (
      select tmdb_id, kind from availability
      union select tmdb_id, 'tv' from follows
      union select tmdb_id, kind from verdicts where verdict = 'watchlist'
    )
    select w.tmdb_id, w.kind, coalesce(t.title, c.title) as title
    from wanted w
    left join titles t on t.tmdb_id = w.tmdb_id and t.kind = w.kind
    left join catalog_titles c on c.tmdb_id = w.tmdb_id and c.kind = w.kind
    left join watch_links l on l.tmdb_id = w.tmdb_id and l.kind = w.kind
    where coalesce(t.title, c.title) is not null
    order by l.checked_at asc nulls first
    limit ${limit}`);
  let asked = 0;
  let withLinks = 0;
  let failed = 0;
  for (const r of rows) {
    let links: Map<number, string> | null;
    try {
      links = await ask(r.kind, r.tmdb_id, r.title, { throwOn429: true });
    } catch {
      return { asked, withLinks, failed, throttled: true };
    }
    if (!links) failed++;
    else {
      save(r.kind, r.tmdb_id, links);
      asked++;
      if (links.size) withLinks++;
    }
    await new Promise((done) => setTimeout(done, pauseMs));
  }
  return { asked, withLinks, failed, throttled: false };
}
