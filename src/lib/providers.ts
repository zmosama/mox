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
 * The names to record or badge, in the order the services were given — so the
 * caller's ordering (TMDB priority, or the viewer's own picks) is what shows.
 */
export function includedOn(
  providers: WatchProviders | undefined,
  services: ServiceEntry[],
  homeRegion: string,
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
  return names;
}
