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
 * Asked when the title is opened and kept in memory for a few hours, never
 * stored: a new season, a title arriving on a service, a link a service
 * changes — all are right the next time anybody looks. A title JustWatch does
 * not have, or an answer slower than two seconds, falls back to the search
 * URL, exactly as before.
 *
 * For some series a service's link is its first episode rather than the
 * series (TOD, OSN+): it still opens the right show in the right app.
 */
import type { MediaKind } from "@/db/schema";
import { region } from "./tmdb";

const ENDPOINT = "https://apis.justwatch.com/graphql";
const TTL = 6 * 3600_000;
const cache = new Map<string, { at: number; links: Map<number, string> }>();

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

/** Each service's link to this title, by provider id. Empty when JustWatch has none. */
export async function watchLinks(kind: MediaKind, tmdbId: number, title: string): Promise<Map<number, string>> {
  const k = `${kind}:${tmdbId}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.links;

  const links = new Map<number, string>();
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
    const body = (await res.json()) as Answer;
    // The search is by name; the match is by TMDB id and kind, so a remake
    // or a namesake is never taken for this title.
    const node = body.data?.popularTitles?.edges?.find(
      (e) =>
        e.node.content?.externalIds?.tmdbId === String(tmdbId) &&
        (e.node.objectType === "SHOW") === (kind === "tv"),
    )?.node;
    for (const o of node?.offers ?? []) {
      const id = o.package?.packageId;
      if (!id || !o.standardWebURL || links.has(id)) continue;
      links.set(id, clean(o.standardWebURL));
    }
  } catch {
    // Slow or unreachable: the search links stand.
  }
  cache.set(k, { at: Date.now(), links });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return links;
}
