/**
 * Which of this install's services a title is actually included on, read from
 * TMDB's `watch/providers` block.
 *
 * The title sheet and the nightly feed builder have to answer this identically.
 * They were two copies of the same rules once and the copies disagreed about
 * fallback regions, so the same film showed a Disney Plus badge when opened and
 * none when listed.
 */

/** Rent and purchase are not a subscription; only what's included counts. */
export const INCLUDED = ["flatrate", "free", "ads"] as const;

/** What a store sells. Deliberately never merged into {@link INCLUDED}. */
export const FOR_SALE = ["rent", "buy"] as const;

/**
 * Services that sell films rather than including them.
 *
 * TMDB reports these beside the subscriptions and says nothing to tell them
 * apart, so the distinction has to be stated. It matters because a badge is a
 * promise: putting "Apple TV Store" on a card the way "Netflix" appears there
 * would say a film is yours to watch when it is actually yours to buy.
 *
 * Small and stable enough to keep by hand — there are only so many storefronts,
 * and a provider missing from here simply behaves as a subscription would,
 * which for a store means never matching anything and going quietly unused.
 */
export const STORE_PROVIDERS = new Set([
  2,    // Apple TV Store
  3,    // Google Play Movies
  10,   // Amazon Video
  68,   // Microsoft Store
  35,   // Rakuten TV
  192,  // YouTube
]);

export const isStore = (providerId: number) => STORE_PROVIDERS.has(providerId);

export type WatchProvider = { provider_id: number; provider_name: string };

/** TMDB's payload shape: region -> bucket -> providers. */
export type WatchProviders = Record<string, Record<string, WatchProvider[]>>;

/** Whether TMDB lists this store as renting or selling the title here. */
export const soldOn = (providers: WatchProviders | undefined, homeRegion: string, providerId: number) =>
  FOR_SALE.some((bucket) => providers?.[homeRegion]?.[bucket]?.some((p) => p.provider_id === providerId) ?? false);

/** A service as this install knows it; `regions` is its fallback list. */
export type ServiceEntry = {
  providerId: number;
  name: string;
  regions?: string[] | null;
};

/**
 * Fallback regions kept in code, for services whose local listing is known to
 * have gaps. Used when the catalogue row has none of its own.
 *
 * TOD is beIN's service across the Arab world, and TMDB's Egyptian listing of
 * it is thin: MobLand's second season streams on TOD in Egypt, and TMDB lists
 * it under Qatar and Morocco but not here. The catalogue is largely one
 * catalogue region-wide, so a title TOD carries in its other Arab markets is
 * taken to be on TOD here too. A known assumption, agreed with the owner, not
 * a fact TMDB states.
 */
export const FALLBACK_REGIONS: Record<number, string[]> = {
  1750: ["QA", "AE", "SA", "KW", "BH", "OM", "JO", "LB", "MA", "DZ", "TN", "IQ", "LY", "PS", "YE"], // TOD
};

/**
 * A streamer's own network on TMDB, and the service it is.
 *
 * TMDB's service listings arrive from JustWatch a day or more after a show
 * does: Blade Runner 2099 was dated, followed and hours from landing while
 * TMDB listed it in no country at all, so the page said "Not on your services"
 * to someone paying for Prime Video. The network is on the show's record from
 * the day it is announced, and for these it is the answer: what they make
 * themselves they carry everywhere they are sold.
 *
 * Only streamers that are one service worldwide. HBO, FX or Hulu are networks
 * too, and where their shows land here is a licensing deal TMDB has to tell us.
 */
export const NETWORK_SERVICE: Record<number, number> = {
  213: 8,     // Netflix
  1024: 119,  // Prime Video -> Amazon Prime Video
  2552: 350,  // Apple TV
  2739: 337,  // Disney+
};

/**
 * The networks to hand {@link includedOn}: the show's own, once it has started.
 *
 * Not before. A row in `availability` is what announces "Now on Prime Video"
 * to a watchlist, and a series announced a year ahead already names its
 * network — so without this every one of them would be reported as arrived.
 */
export const startedOn = <N extends { id?: number | null }>(
  show: { first_air_date?: string | null; networks?: N[] | null },
  today: string,
): N[] | null =>
  show.first_air_date && show.first_air_date <= today ? (show.networks ?? null) : null;

/**
 * The names to record or badge, in the order the services were given — so the
 * caller's ordering (TMDB priority, or the viewer's own picks) is what shows.
 *
 * `networks` is the show's own, and is only consulted when TMDB lists nothing
 * included here at all — see {@link NETWORK_SERVICE}. A listing on a service
 * the viewer does not have is still a listing, and is left to stand.
 */
export function includedOn(
  providers: WatchProviders | undefined,
  services: ServiceEntry[],
  homeRegion: string,
  networks?: { id?: number | null }[] | null,
): string[] {
  const regions = providers ?? {};

  const here = new Set<number>();
  for (const bucket of INCLUDED) {
    for (const p of regions[homeRegion]?.[bucket] ?? []) here.add(p.provider_id);
  }

  const names: string[] = [];
  for (const service of services) {
    if (here.has(service.providerId)) {
      /* The catalogue's spelling, never TMDB's: `availability.provider` joins
         to `services.name`, so a provider TMDB has renamed since the last
         catalogue sync would write rows that join to nothing and lose both
         their logo and their place in the service filter. */
      names.push(service.name);
      continue;
    }
    /* A service not sold locally (Disney Plus here) has no entry under our
       region at all, so it is read from the regions it does exist in. */
    const fallback = service.regions?.length ? service.regions : (FALLBACK_REGIONS[service.providerId] ?? []);
    const elsewhere = fallback.some((r) =>
      INCLUDED.some((bucket) =>
        (regions[r]?.[bucket] ?? []).some((p) => p.provider_id === service.providerId),
      ),
    );
    if (elsewhere) names.push(service.name);
  }

  if (!names.length && !here.size && networks?.length) {
    const own = new Set(networks.map((n) => NETWORK_SERVICE[n.id ?? -1]).filter(Boolean));
    for (const service of services) if (own.has(service.providerId)) names.push(service.name);
  }
  return names;
}
