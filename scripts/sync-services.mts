/**
 * Refresh the streaming-service catalogue from TMDB.
 *
 *   npx tsx scripts/sync-services.mts
 *
 * This is the list people pick from on /admin/services, so it has to be every
 * service available here — not only the ones this install happens to have data
 * for. TMDB's own display_priority orders it, which puts Netflix and Shahid at
 * the top and the long tail of niche catalogues underneath.
 *
 * Existing rows keep their search_url and regions: those are hand-written and
 * TMDB does not know them. Disney Plus in particular is not listed for Egypt at
 * all — it is read from other regions — so anything already in the table stays
 * whether or not TMDB returns it.
 */
import Database from "better-sqlite3";
import { tmdb, region } from "../src/lib/tmdb";

type Provider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
};

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const db = new Database(process.env.MOX_DB ?? "./data/mox.db");

const seen = new Map<number, Provider>();
for (const kind of ["movie", "tv"] as const) {
  const res = await tmdb<{ results: Provider[] }>(`/watch/providers/${kind}`, {
    watch_region: region(),
  });
  for (const p of res.results) {
    const existing = seen.get(p.provider_id);
    // A service can appear in both lists with different priorities; keep the
    // stronger one so the ordering reflects its best placement.
    if (!existing || p.display_priority < existing.display_priority) seen.set(p.provider_id, p);
  }
}

const before = db.prepare("select count(*) as n from services").get() as { n: number };

const upsert = db.prepare(`
  insert into services (provider_id, slug, name, logo, priority)
  values (?, ?, ?, ?, ?)
  on conflict(provider_id) do update set
    name = excluded.name,
    logo = excluded.logo,
    priority = excluded.priority
`);

db.transaction(() => {
  for (const p of seen.values()) {
    upsert.run(
      p.provider_id,
      slugify(p.provider_name),
      p.provider_name,
      p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
      p.display_priority,
    );
  }
})();

const after = db.prepare("select count(*) as n from services").get() as { n: number };
console.log(`catalogue for ${region()}: ${before.n} -> ${after.n} services`);

const kept = db
  .prepare("select name from services where regions is not null")
  .all() as { name: string }[];
console.log(`read from other regions: ${kept.map((k) => k.name).join(", ") || "none"}`);
