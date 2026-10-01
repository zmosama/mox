/**
 * Where the Play button goes, per service.
 *
 * One rule per service, computed when the link is asked for. Nothing is stored
 * and nothing is scraped, which is the point: a rule cannot go stale, costs the
 * database nothing, and is as right for an episode released tomorrow as for one
 * released last year, with nobody tending it.
 *
 * This replaces four copies of the same knowledge — a `search_url` column
 * patched by throwaway scripts against production, a `KNOWN_SEARCH` table in the
 * refresh, the legacy importer's own list, and a `replace("{q}", …)` at five
 * call sites. They disagreed, and that is how Shahid came to be sent `q` when it
 * reads `term`, and OSN+ `q` when it reads `query`.
 *
 * A rule is only as good as its evidence, so each says how it was verified.
 * "Logged in" means Mohammed confirmed it on his own account; nobody else can,
 * because every one of these hides search behind a login.
 */

type Rule = {
  /** The URL for a title. `q` is the title, already encoded. */
  search: (q: string) => string;
  verified: string;
};

const RULES: Record<number, Rule> = {
  // Netflix
  8: {
    search: (q) => `https://www.netflix.com/search?q=${q}`,
    verified: "logged in (Mohammed): search?q=fast%20and%20furious",
  },
  // Shahid VIP
  1715: {
    search: (q) => `https://shahid.mbc.net/search?term=${q}`,
    verified: "logged in (Mohammed); with q the page loaded and searched nothing",
  },
  // OSN+
  629: {
    search: (q) => `https://osnplus.com/en-eg/search?query=${q}`,
    verified: "logged in (Mohammed); with q it showed nothing",
  },
  // TOD
  1750: {
    search: (q) => `https://www.tod.tv/en/search?q=${q}`,
    verified: "logged in (Mohammed): search?q=mobland",
  },
  // Apple TV, and the Apple TV Store
  350: {
    search: (q) => `https://tv.apple.com/eg/search?term=${q}`,
    verified: "logged out; without /eg/ it redirects to the American store",
  },
  2: {
    search: (q) => `https://tv.apple.com/eg/search?term=${q}`,
    verified: "logged out; same store as Apple TV",
  },
  // Disney+ is the one service with no search URL at all: /browse/search takes
  // no query, so it could only ever open empty. Instead this asks DuckDuckGo
  // for its first result on disneyplus.com — `!ducky` redirects straight to it —
  // which is the title's own page, better than any search would have been.
  // Andor, Shōgun, Furious and Moana 2 all landed on the right Egyptian page;
  // Moana 2 matters, because it did not fall back to the first film.
  337: {
    search: (q) => `https://duckduckgo.com/?q=!ducky+site%3Adisneyplus.com+${q}`,
    verified: "4 of 4 titles land on their own page (2026-10-01); depends on DuckDuckGo",
  },
  // STARZPLAY — /en/, not the /en-eg/ it had been sent.
  630: {
    search: (q) => `https://starzplay.com/en/search?q=${q}`,
    verified: "logged in (Mohammed): /en/search?q=liones",
  },
  // Amazon Prime Video — `phrase`. Its own links add ie= and ref_=, which are
  // tracking and change nothing.
  119: {
    search: (q) => `https://www.primevideo.com/search?phrase=${q}`,
    verified: "logged in (Mohammed): /search?ie=UTF8&ref_=atv_nb_sug&phrase=crime+101",
  },
  // Stores and general catalogues, unchanged from what they were.
  3: {
    search: (q) => `https://play.google.com/store/search?q=${q}&c=movies`,
    verified: "UNVERIFIED",
  },
  10: {
    search: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`,
    verified: "UNVERIFIED",
  },
  192: {
    search: (q) => `https://www.youtube.com/results?search_query=${q}+movie`,
    verified: "UNVERIFIED",
  },
};

// ------------------------------------------------------------ the title page

/**
 * How to find the title's own page on a service — better than any search.
 *
 * DuckDuckGo's `!ducky`, limited to the service's domain, redirects straight to
 * its first result, which is usually the title's page: Netflix's /title/, the
 * series page on Shahid, OSN+, TOD and STARZPLAY. It only works in a real
 * browser — fetched from a server, DuckDuckGo answers with a bot challenge — so
 * the iPhone app follows it in a hidden web view and opens the service's own
 * app on the result. That makes being wrong expensive, so nothing is opened
 * unless the page passes `accept`:
 *
 *   - on the service's host, and on a title page rather than the home page or a
 *     list (OSN+ with no Oppenheimer lands on its home; TOD on a /list/ page);
 *   - of the right kind, where the service's paths say so (/series/ or /movies/);
 *   - with this title's name in the path, where the path carries one — which is
 *     what rejects John Wick: Chapter 4 for John Wick, and the 2020 concert
 *     "ليلة البرنس" for the series البرنس.
 *
 * Anything else falls back to `url`, the verified search.
 */
export type Find = {
  /** What to load. */
  url: string;
  /** The service's host; the page must be on it or a subdomain of it. */
  host: string;
  /** Matched, case-insensitively, against the decoded path. */
  accept: string;
  /** [pattern, replacement] pairs applied to the path once accepted. */
  rewrite: [string, string][];
};

type Kind = "movie" | "tv";

type Finder = {
  domain: string;
  /** `{slug}` is replaced by the title's words, any separators between them. */
  paths: Record<Kind, string>;
  /** Put the result in the Egyptian storefront. */
  rewrite?: [string, string][];
};

const FINDERS: Record<number, Finder> = {
  8: {
    domain: "netflix.com",
    // No name in a Netflix URL to check: /title/<id> for films and series alike.
    paths: { movie: String.raw`^/(?:[a-z]{2}(?:-[a-z]{2})?/)?title/\d+`, tv: String.raw`^/(?:[a-z]{2}(?:-[a-z]{2})?/)?title/\d+` },
  },
  1715: {
    domain: "shahid.mbc.net",
    paths: {
      tv: String.raw`^/(?:ar|en)/series/{slug}(?:-season-\d+)?/`,
      movie: String.raw`^/(?:ar|en)/movies/{slug}(?:-(?:19|20)\d\d)?/`,
    },
  },
  629: {
    domain: "osnplus.com",
    paths: {
      tv: String.raw`^/[a-z]{2}-[a-z]{2}/series/{slug}-\d+$`,
      movie: String.raw`^/[a-z]{2}-[a-z]{2}/movies?/{slug}-\d+$`,
    },
    // It lands on whichever storefront ranked first — Survivor came back /en-sa/.
    rewrite: [[String.raw`^/(en|ar)-[a-z]{2}/`, "/$1-eg/"]],
  },
  1750: {
    domain: "tod.tv",
    paths: {
      tv: String.raw`^/[a-z]{2}/series/[a-z]+/{slug}-\d+$`,
      movie: String.raw`^/[a-z]{2}/movies?/[a-z]+/{slug}-\d+$`,
    },
  },
  630: {
    domain: "starzplay.com",
    paths: {
      tv: String.raw`^/[a-z]{2}/series/{slug}/\d+`,
      movie: String.raw`^/[a-z]{2}/movies/{slug}/\d+`,
    },
  },
  119: {
    domain: "primevideo.com",
    paths: { movie: String.raw`^/detail/[A-Za-z0-9]+`, tv: String.raw`^/detail/[A-Za-z0-9]+` },
  },
  350: {
    domain: "tv.apple.com",
    paths: {
      tv: String.raw`^/[a-z]{2}/show/{slug}/umc\.`,
      movie: String.raw`^/[a-z]{2}/movie/{slug}/umc\.`,
    },
    // Severance and F1 both came back on the American store.
    rewrite: [[String.raw`^/[a-z]{2}/`, "/eg/"]],
  },
  337: {
    domain: "disneyplus.com",
    paths: { movie: String.raw`^/[a-z]{2}-[a-z]{2}/browse/entity-`, tv: String.raw`^/[a-z]{2}-[a-z]{2}/browse/entity-` },
    rewrite: [[String.raw`^/([a-z]{2})-[a-z]{2}/`, "/$1-eg/"]],
  },
};
FINDERS[2] = FINDERS[350];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The title as it would appear in a service's URL: its words, in order. */
export function slugPattern(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Shōgun -> Shogun
    .toLowerCase()
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter(Boolean)
    .map(escape);
  return words.join("[^a-z0-9\\u0600-\\u06ff]+");
}

/** How to find a title's own page on a service, or null if it has no finder. */
export function findFor(
  providerId: number | null | undefined,
  title: string,
  kind: Kind,
  year?: number | null,
): Find | null {
  const f = providerId == null ? undefined : FINDERS[providerId];
  const slug = slugPattern(title);
  if (!f || !slug) return null;
  // The year steers a film to the right instalment; a series' first year
  // rarely appears on its page and only adds noise.
  const words = kind === "movie" && year ? `${title} ${year}` : title;
  return {
    url: `https://duckduckgo.com/?q=!ducky+site%3A${f.domain}+${encodeURIComponent(words)}`,
    host: f.domain,
    accept: f.paths[kind].replace("{slug}", slug),
    rewrite: f.rewrite ?? [],
  };
}

/**
 * The rule the iPhone app applies to wherever the hidden web view lands: the
 * page to open, or null to fall back to the search. Written here so it can be
 * tested against real landings; `ios/MOX/Player.swift` does exactly this.
 */
export function accepted(find: Find, landed: string): string | null {
  let u: URL;
  try { u = new URL(landed); } catch { return null; }
  const onHost = u.hostname === find.host || u.hostname.endsWith(`.${find.host}`);
  if (!onHost) return null;
  let path: string;
  try { path = decodeURIComponent(u.pathname); } catch { path = u.pathname; }
  if (!new RegExp(find.accept, "i").test(path)) return null;
  let out = u.pathname;
  for (const [pattern, to] of find.rewrite) out = out.replace(new RegExp(pattern, "i"), to);
  return `${u.origin}${out}${u.search}`;
}

/**
 * The Play URL for a title on a service, or null if the service has no rule.
 *
 * A hand-made deep link wins where one exists: the legacy import carries a few
 * dozen that Mohammed chose himself, and those point at exactly the right page.
 */
export function playUrl(
  providerId: number | null | undefined,
  title: string,
  deepLink?: string | null,
): string | null {
  if (deepLink) return deepLink;
  const rule = providerId == null ? undefined : RULES[providerId];
  // %20 for spaces, not +: that is what the services' own search boxes write.
  return rule ? rule.search(encodeURIComponent(title)) : null;
}

/** For tests and the admin screen: which services are ruled, and on what evidence. */
export const PLAY_RULES = RULES;
