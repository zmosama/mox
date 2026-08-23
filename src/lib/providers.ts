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
    const elsewhere = (service.regions ?? []).some((r) =>
      INCLUDED.some((bucket) =>
        (regions[r]?.[bucket] ?? []).some((p) => p.provider_id === service.providerId),
      ),
    );
    if (elsewhere) names.push(service.name);
  }
  return names;
}
