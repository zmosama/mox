/**
 * Refresh the streaming-service catalogue from TMDB.
 *
 * This is the list people pick from on /admin/services, so it has to be every
 * service available here — not only the ones this install happens to have data
 * for. TMDB's own display_priority orders it, which puts the services in real
 * use at the top and the long tail of niche catalogues underneath.
 *
 * Existing rows keep their `regions`: those are hand-written
 * and TMDB does not know them. A service not sold locally is not in TMDB's list
 * for our region at all, so anything already in the table stays whether or not
 * TMDB returns it — this only ever adds and updates.
 */
import { sql } from "drizzle-orm";
import { db, HOME, s } from "./shared.mjs";
import { tmdb } from "../../src/lib/tmdb";

type Provider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
};

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * Where to search a service that was never hand-configured.
 *
 * The originals came from the legacy import and only cover the services this
 * install started with, so anything picked on /admin/services since then has
 * had no link behind its badge — Apple TV Store came in with the store section
 * and its cards led nowhere. Only ever filled in when the column is empty, so a
 * hand-written URL is still the one that wins.
 */

export async function refreshServices() {
  const seen = new Map<number, Provider>();
  for (const kind of ["movie", "tv"] as const) {
    const res = await tmdb<{ results: Provider[] }>(`/watch/providers/${kind}`, {
      watch_region: HOME,
    });
    for (const p of res.results) {
      const existing = seen.get(p.provider_id);
      // A service can appear in both lists with different priorities; keep the
      // stronger one so the ordering reflects its best placement.
      if (!existing || p.display_priority < existing.display_priority) {
        seen.set(p.provider_id, p);
      }
    }
  }

  if (!seen.size) throw new Error("TMDB returned no providers for " + HOME);

  const before = db.select({ n: sql<number>`count(*)` }).from(s.services).get()?.n ?? 0;

  db.transaction((tx) => {
    for (const p of seen.values()) {
      tx.insert(s.services)
        .values({
          providerId: p.provider_id,
          slug: slugify(p.provider_name),
          name: p.provider_name,
          logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
          priority: p.display_priority,
        })
        .onConflictDoUpdate({
          target: s.services.providerId,
          set: {
            name: p.provider_name,
            logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
            priority: p.display_priority,
          },
        })
        .run();
    }
  });

  const after = db.select({ n: sql<number>`count(*)` }).from(s.services).get()?.n ?? 0;
  return `${after} services for ${HOME}${after > before ? ` (+${after - before})` : ""}`;
}
