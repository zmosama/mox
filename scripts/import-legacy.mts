/**
 * One-way import of the JSON files the Python version wrote into SQLite.
 *
 *   npx tsx scripts/import-legacy.ts ./legacy
 *
 * Reads only — the source files are never touched. Every table is checked
 * against the source count at the end and the script exits non-zero on any
 * mismatch, because a silent partial import of 332 hand-made ratings is the
 * one failure that can't be undone.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as s from "../src/db/schema.js";
import type { Feed, MediaKind, Verdict, FeatureKind } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/hash.js";

const SRC = process.argv[2] ?? "./legacy";
const DB_FILE = process.env.MOX_DB ?? "./data/mox.db";

const read = <T,>(name: string, fallback: T): T => {
  const p = join(SRC, name);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8")) as T;
};

type LegacyFeedItem = {
  tmdb_id: number; title: string; type?: MediaKind; date?: string; year?: number;
  poster?: string | null; overview?: string; rating?: number; votes?: number;
  platforms?: string[];
};

type LegacyItem = {
  title: string; year: number; type: MediaKind; tmdb_id?: number | null;
  poster?: string | null; overview?: string; tmdb_rating?: number;
  tmdb_votes?: number; lang?: string; genres?: string[]; release_date?: string;
};

const OWNER = process.env.MOX_OWNER;
if (!OWNER) {
  console.error("\n  set MOX_OWNER to the username the owner account should have\n");
  process.exit(1);
}
const OWNER_PASSWORD = process.env.MOX_OWNER_PASSWORD;
if (!OWNER_PASSWORD) {
  console.error("\n  set MOX_OWNER_PASSWORD so the owner account can be created\n");
  process.exit(1);
}

const sqlite = new Database(DB_FILE);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema: s });
migrate(db, { migrationsFolder: "./drizzle" });

const catalog = read<LegacyItem[]>("catalog.json", []);
const ratings = read<Record<string, Verdict>>("ratings.json", {});
const follows = read<number[]>("follows.json", []);
const features = read<Record<string, {
  keywords?: string[]; people?: string[]; collection?: string | null;
  companies?: string[]; lang?: string | null; decade?: number; runtime?: number;
}>>("features.json", {});
const similar = read<Record<string, [number, string, number][]>>("similar.json", {});
const calendar = read<{ show: string; season: number; episode: number; airs: string }[]>("calendar.json", []);
const showMap = read<Record<string, {
  tmdb_id?: number; tmdb_name?: string; poster?: string | null;
  rating?: number; votes?: number; genres?: string[] | null;
  yours?: string[]; others?: string[];
}>>("show_map.json", {});

/**
 * TMDB's own spelling wins. show_map recorded whatever label was in use at the
 * time ("Disney+"), which no longer matches the services table ("Disney Plus"),
 * so those rows lost their logo and rendered as bare text beside logos.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  "Disney+": "Disney Plus",
  "Prime Video": "Amazon Prime Video",
  "Apple TV+": "Apple TV",
};
const canonProvider = (name: string) => PROVIDER_ALIASES[name] ?? name;
const movies = read<{
  new?: LegacyFeedItem[]; upcoming?: LegacyFeedItem[]; trending?: LegacyFeedItem[];
}>("movies.json", {});
const universes = read<Record<string, {
  ar: string; en: string;
  titles: { tmdb_id: number; type: MediaKind; title: string; date: string;
            year: number; poster: string | null; rating: number;
            platforms: string[]; upcoming: boolean }[];
}>>("universes.json", {});
const watchLinks = read<Record<string, Record<string, string>>>("watchlinks.json", {});
const tmdbOv = read<Record<string, number>>("tmdb_overrides.json", {});
const showOv = read<Record<string, number | null>>("show_overrides.json", {});

/** ratings.json is keyed "Title|Year"; the catalog is what maps that to an id. */
const keyOf = (i: LegacyItem) => `${i.title}|${i.year}`;
const byKey = new Map(catalog.map((i) => [keyOf(i), i]));

const ownerHash = await hashPassword(OWNER_PASSWORD);

const report: Record<string, { got: number; want: number }> = {};
const track = (name: string, got: number, want: number) => { report[name] = { got, want }; };

let ownerId = 0;

db.transaction((tx) => {
  // ---- the owner ---------------------------------------------------------
  // Everything the Python version stored was one person's, so it all lands on
  // this account. Later accounts start empty and build their own taste.
  tx.insert(s.users)
    .values({ username: OWNER, passwordHash: ownerHash, displayName: "Mohammed", isAdmin: true })
    .onConflictDoNothing()
    .run();
  ownerId = tx.select().from(s.users).all().find((u) => u.username === OWNER)!.id;

  // ---- titles ------------------------------------------------------------
  const rows = catalog.filter((i) => i.tmdb_id);
  for (const i of rows) {
    tx.insert(s.titles).values({
      tmdbId: i.tmdb_id!, kind: i.type, title: i.title, year: i.year || null,
      releaseDate: i.release_date ?? null, poster: i.poster ?? null,
      overview: i.overview ?? null, rating: i.tmdb_rating ?? null,
      votes: i.tmdb_votes ?? null, lang: i.lang ?? null,
      collection: features[String(i.tmdb_id)]?.collection ?? null,
    }).onConflictDoNothing().run();
  }
  track("titles", tx.select().from(s.titles).all().length, new Set(rows.map(r => `${r.tmdb_id}:${r.type}`)).size);

  // ---- verdicts ----------------------------------------------------------
  const orphaned: string[] = [];
  for (const [key, verdict] of Object.entries(ratings)) {
    const item = byKey.get(key);
    if (!item?.tmdb_id) { orphaned.push(key); continue; }
    tx.insert(s.verdicts)
      .values({ userId: ownerId, tmdbId: item.tmdb_id, kind: item.type, verdict })
      .onConflictDoUpdate({
        target: [s.verdicts.userId, s.verdicts.tmdbId, s.verdicts.kind],
        set: { verdict },
      })
      .run();
  }
  if (orphaned.length) {
    console.error(`\n  ${orphaned.length} ratings have no catalog entry and would be lost:`);
    for (const k of orphaned.slice(0, 20)) console.error("    " + k);
    throw new Error("refusing to import with orphaned ratings");
  }
  track("verdicts", tx.select().from(s.verdicts).all().length, Object.keys(ratings).length);

  // ---- follows -----------------------------------------------------------
  for (const id of follows) {
    tx.insert(s.follows).values({ userId: ownerId, tmdbId: id }).onConflictDoNothing().run();
  }
  track("follows", tx.select().from(s.follows).all().length, follows.length);

  // ---- features ----------------------------------------------------------
  const kindOf = new Map(catalog.filter(c => c.tmdb_id).map(c => [String(c.tmdb_id), c.type]));
  const addFeature = (id: number, kind: MediaKind, feature: FeatureKind, value: string) => {
    tx.insert(s.features).values({ tmdbId: id, kind, feature, value }).onConflictDoNothing().run();
  };
  for (const [idStr, f] of Object.entries(features)) {
    const id = Number(idStr);
    const kind = (kindOf.get(idStr) ?? "movie") as MediaKind;
    for (const k of f.keywords ?? []) addFeature(id, kind, "keyword", k);
    for (const p of f.people ?? []) addFeature(id, kind, "person", p);
    for (const c of f.companies ?? []) addFeature(id, kind, "company", c);
    if (f.collection) addFeature(id, kind, "collection", f.collection);
    if (f.lang) addFeature(id, kind, "lang", f.lang);
    if (f.decade) addFeature(id, kind, "decade", String(f.decade));
  }
  for (const i of catalog) {
    if (!i.tmdb_id) continue;
    for (const g of i.genres ?? []) addFeature(i.tmdb_id, i.type, "genre", g);
    // Six catalog entries were never enriched, so features.json has no row for
    // them. The Python model falls back to the catalog's own language, and
    // dropping that here shifted every language's rarity weight.
    if (!features[String(i.tmdb_id)] && i.lang) {
      addFeature(i.tmdb_id, i.type, "lang", i.lang);
    }
  }
  track("features", tx.select().from(s.features).all().length, -1);

  // ---- similars ----------------------------------------------------------
  for (const [idStr, list] of Object.entries(similar)) {
    const id = Number(idStr);
    const kind = (kindOf.get(idStr) ?? "movie") as MediaKind;
    for (const [targetId, targetTitle, rank] of list) {
      tx.insert(s.similars)
        .values({ sourceId: id, sourceKind: kind, targetId, targetTitle, rank })
        .onConflictDoNothing().run();
    }
  }
  track("similars", tx.select().from(s.similars).all().length, -1);

  // ---- episodes ----------------------------------------------------------
  for (const e of calendar) {
    tx.insert(s.episodes).values({
      show: e.show, season: e.season, episode: e.episode, airs: e.airs,
      tmdbId: showMap[e.show]?.tmdb_id ?? null,
    }).onConflictDoNothing().run();
  }
  track("episodes", tx.select().from(s.episodes).all().length, -1);

  // ---- calendar shows: their titles, then where they stream ---------------
  // Importing only the availability left every calendar row without a poster.
  for (const [show, info] of Object.entries(showMap)) {
    if (!info.tmdb_id) continue;
    tx.insert(s.titles).values({
      tmdbId: info.tmdb_id, kind: "tv",
      title: info.tmdb_name ?? show,
      poster: info.poster ?? null,
      rating: info.rating ?? null,
      votes: info.votes ?? null,
    }).onConflictDoNothing().run();

    for (const g of info.genres ?? []) {
      addFeature(info.tmdb_id, "tv", "genre", g);
    }
    for (const p of info.yours ?? [])
      tx.insert(s.availability)
        .values({ tmdbId: info.tmdb_id, kind: "tv", provider: canonProvider(p), region: "EG", mine: true })
        .onConflictDoNothing().run();
    for (const p of info.others ?? [])
      tx.insert(s.availability)
        .values({ tmdbId: info.tmdb_id, kind: "tv", provider: canonProvider(p), region: "EG", mine: false })
        .onConflictDoNothing().run();
  }
  track("availability", tx.select().from(s.availability).all().length, -1);

  // ---- services ----------------------------------------------------------
  // Written straight in rather than read from a config file: the set is small,
  // it changes when a subscription changes, and it belongs with the data.
  const SERVICES = [
    { providerId: 8, slug: "netflix", name: "Netflix",
      searchUrl: "https://www.netflix.com/search?q={q}" },
    { providerId: 119, slug: "prime_video", name: "Amazon Prime Video",
      searchUrl: "https://www.primevideo.com/search/ref=atv_nb_sr?phrase={q}" },
    { providerId: 1715, slug: "shahid_vip", name: "Shahid VIP",
      searchUrl: "https://shahid.mbc.net/en/search?q={q}" },
    { providerId: 629, slug: "osn_plus", name: "OSN+",
      searchUrl: "https://stream.osn.com/en/search?query={q}" },
    { providerId: 630, slug: "starzplay", name: "STARZPLAY",
      searchUrl: "https://starzplay.com/en-eg/search?q={q}" },
    { providerId: 1750, slug: "tod", name: "TOD",
      searchUrl: "https://tod.tv/en/search?q={q}" },
    { providerId: 350, slug: "apple_tv", name: "Apple TV",
      searchUrl: "https://tv.apple.com/search?term={q}" },
    // Not sold in Egypt, so TMDB lists no EG availability for it; read from
    // these regions instead or a followed show simply vanishes.
    { providerId: 337, slug: "disney_plus", name: "Disney Plus",
      searchUrl: "https://www.disneyplus.com/search?q={q}",
      regions: ["GB", "DE", "TR", "US"] },
  ];
  for (const svc of SERVICES) {
    tx.insert(s.services).values({ ...svc, regions: svc.regions ?? null })
      .onConflictDoNothing().run();
  }
  track("services", tx.select().from(s.services).all().length, SERVICES.length);

  // ---- deep links --------------------------------------------------------
  for (const [cacheKey, links] of Object.entries(watchLinks)) {
    const [kind, idStr] = cacheKey.split(":");
    const id = Number(idStr);
    if (!id) continue;
    for (const [provider, url] of Object.entries(links)) {
      tx.insert(s.availability)
        .values({ tmdbId: id, kind: kind as MediaKind, provider: canonProvider(provider), region: "EG", mine: true, deepLink: url })
        .onConflictDoUpdate({
          target: [s.availability.tmdbId, s.availability.kind, s.availability.provider, s.availability.region],
          set: { deepLink: url },
        })
        .run();
    }
  }

  // ---- feeds -------------------------------------------------------------
  const built = new Date().toISOString().slice(0, 10);
  const feeds: [Feed, LegacyFeedItem[]][] = [
    ["new", movies.new ?? []],
    ["upcoming", movies.upcoming ?? []],
    ["trending", movies.trending ?? []],
  ];
  for (const [name, items] of feeds) {
    items.forEach((m, position) => {
      const kind = (m.type ?? "movie") as MediaKind;
      tx.insert(s.titles).values({
        tmdbId: m.tmdb_id, kind, title: m.title,
        year: m.year ?? null, releaseDate: m.date ?? null,
        poster: m.poster ?? null, overview: m.overview ?? null,
        rating: m.rating ?? null, votes: m.votes ?? null,
      }).onConflictDoNothing().run();

      for (const p of m.platforms ?? []) {
        tx.insert(s.availability)
          .values({ tmdbId: m.tmdb_id, kind, provider: canonProvider(p), region: "EG", mine: true })
          .onConflictDoNothing().run();
      }

      tx.insert(s.feedItems)
        .values({ feed: name, tmdbId: m.tmdb_id, kind, position, builtAt: built })
        .onConflictDoNothing().run();
    });
  }
  track("feedItems", tx.select().from(s.feedItems).all().length, -1);

  // ---- universes ---------------------------------------------------------
  for (const [slug, u] of Object.entries(universes)) {
    tx.insert(s.universes).values({ slug, name: u.en }).onConflictDoNothing().run();
    for (const t of u.titles) {
      tx.insert(s.titles).values({
        tmdbId: t.tmdb_id, kind: t.type, title: t.title,
        year: t.year ?? null, releaseDate: t.date ?? null,
        poster: t.poster ?? null, rating: t.rating ?? null,
      }).onConflictDoNothing().run();
      for (const p of t.platforms ?? []) {
        tx.insert(s.availability)
          .values({ tmdbId: t.tmdb_id, kind: t.type, provider: canonProvider(p), region: "EG", mine: true })
          .onConflictDoNothing().run();
      }
      tx.insert(s.universeTitles)
        .values({ slug, tmdbId: t.tmdb_id, kind: t.type })
        .onConflictDoNothing().run();
    }
  }
  track("universes", tx.select().from(s.universes).all().length, Object.keys(universes).length);
  track("universeTitles", tx.select().from(s.universeTitles).all().length, -1);

  // ---- hand corrections --------------------------------------------------
  for (const [key, id] of Object.entries(tmdbOv)) {
    if (key.startsWith("_")) continue;
    tx.insert(s.overrides).values({ key, tmdbId: id, kind: "movie", note: "from tmdb_overrides.json" }).onConflictDoNothing().run();
  }
  for (const [key, id] of Object.entries(showOv)) {
    if (key.startsWith("_")) continue;
    tx.insert(s.overrides).values({ key, tmdbId: id, kind: "tv", note: "from show_overrides.json" }).onConflictDoNothing().run();
  }
  track("overrides", tx.select().from(s.overrides).all().length, -1);
});

// ---- verify ---------------------------------------------------------------
console.log(`\n  imported into ${DB_FILE}, owned by "${OWNER}"\n`);
let failed = false;
for (const [name, { got, want }] of Object.entries(report)) {
  const ok = want < 0 ? true : got === want;
  if (!ok) failed = true;
  const expect = want < 0 ? "" : `  (expected ${want})`;
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(14)} ${String(got).padStart(6)}${expect}`);
}
if (failed) { console.error("\n  counts do not match the source — not safe to use\n"); process.exit(1); }
console.log("\n  every count matches the source\n");
