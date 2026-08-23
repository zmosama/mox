/**
 * Fill in each service's logo from TMDB.
 *
 *   npx tsx scripts/sync-service-logos.mts
 *
 * A service is looked up in your own region first, then in the regions it is
 * configured for — Disney+ has no Egyptian listing at all, so without the
 * fallback it would be the one chip rendered as bare text among logos.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import { posterPath, region, tmdb } from "../src/lib/tmdb.js";

type ProviderList = {
  results: { provider_id: number; provider_name: string; logo_path: string | null }[];
};

const sqlite = new Database(process.env.MOX_DB ?? "data/mox.db");
const db = drizzle(sqlite, { schema });

const services = db.select().from(schema.services).all();
const wanted = new Set(services.map((s) => s.providerId));

/** provider_id -> {name TMDB uses, logo} */
const found = new Map<number, { name: string; logo: string | null }>();

async function scan(regionCode: string) {
  for (const kind of ["movie", "tv"] as const) {
    let list: ProviderList;
    try {
      list = await tmdb<ProviderList>(`/watch/providers/${kind}`, { watch_region: regionCode });
    } catch {
      continue;
    }
    for (const p of list.results) {
      if (wanted.has(p.provider_id) && !found.has(p.provider_id)) {
        found.set(p.provider_id, { name: p.provider_name, logo: posterPath(p.logo_path, "w92") });
      }
    }
  }
}

await scan(region());
for (const r of ["US", "GB", "DE"]) {
  if (found.size >= wanted.size) break;
  await scan(r);
}

let updated = 0;
for (const svc of services) {
  const hit = found.get(svc.providerId);
  if (!hit?.logo) {
    console.log(`  ✗ ${svc.name.padEnd(20)} no logo found`);
    continue;
  }
  db.update(schema.services)
    .set({ logo: hit.logo, name: hit.name })
    .where(eq(schema.services.providerId, svc.providerId))
    .run();
  updated++;
  const renamed = hit.name === svc.name ? "" : `  (TMDB calls it "${hit.name}")`;
  console.log(`  ✓ ${hit.name.padEnd(20)} logo set${renamed}`);
}

console.log(`\n  ${updated}/${services.length} services have a logo\n`);
