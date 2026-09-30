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
    verified: "logged out: the search box fills from q",
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
  // Disney+ search lives at /browse/search and only exists signed in — signed
  // out every search path answers 404, which is why this once pointed at the
  // front door. It takes no query in the URL, so it opens search, empty.
  337: {
    search: () => "https://www.disneyplus.com/browse/search",
    verified: "logged in (Mohammed): /browse/search, no query parameter",
  },
  // STARZPLAY — unverified: search is behind login and has no box signed out.
  630: {
    search: (q) => `https://starzplay.com/en-eg/search?q=${q}`,
    verified: "UNVERIFIED",
  },
  // Amazon Prime Video — unverified.
  119: {
    search: (q) => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`,
    verified: "UNVERIFIED",
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
