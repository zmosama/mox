/**
 * TMDB client with a disk cache.
 *
 * Provider listings and genre names barely move, and re-fetching them per page
 * load once cost the board a round trip per watchlist item. Cached responses
 * are keyed by path and query, with a per-endpoint lifetime.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://api.themoviedb.org/3";
const CACHE_DIR = process.env.MOX_TMDB_CACHE ?? "./data/tmdb-cache";

const TTL: [string, number][] = [
  ["/genre/", 7 * 86400],
  ["/watch/providers", 12 * 3600],
  ["/search/", 3600],
];
const DEFAULT_TTL = 6 * 3600;

export class TmdbError extends Error {}

const apiKey = () => {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) throw new TmdbError("TMDB_API_KEY is not set");
  return key;
};

export const region = () => process.env.TMDB_REGION?.trim() || "EG";

const ttlFor = (path: string) =>
  TTL.find(([frag]) => path.includes(frag))?.[1] ?? DEFAULT_TTL;

const cachePath = (path: string, params: Record<string, string>) => {
  const query = Object.entries(params)
    .filter(([k]) => k !== "api_key")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const hash = createHash("sha256").update(`${path}?${query}`).digest("hex").slice(0, 32);
  return join(CACHE_DIR, `${hash}.json`);
};

/**
 * `store: false` skips the disk cache both ways: for answers MOX keeps in its
 * own catalogue (catalog.ts), where a second copy here would only fill the
 * disk — the nightly enrichment alone fetches thousands of full records.
 */
export async function tmdb<T>(
  path: string,
  params: Record<string, string | number> = {},
  opts: { store?: boolean } = {},
): Promise<T> {
  const clean = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ) as Record<string, string>;
  const file = cachePath(path, clean);
  const ttl = ttlFor(path);
  const store = opts.store !== false;

  try {
    if (!store) throw new Error("not cached");
    const raw = await readFile(file, "utf8");
    const { at, body } = JSON.parse(raw) as { at: number; body: T };
    if (Date.now() - at < ttl * 1000) return body;
  } catch {
    // no usable cache entry
  }

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(clean)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey());

  let res = await fetch(url, { cache: "no-store" });
  // Too many at once: TMDB says when to come back. Once, then it is an error.
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 2) * 1000));
    res = await fetch(url, { cache: "no-store" });
  }
  if (!res.ok) throw new TmdbError(`TMDB ${res.status} on ${path}`);
  const body = (await res.json()) as T;
  if (!store) return body;

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify({ at: Date.now(), body }));
    await rename(tmp, file);
  } catch {
    // a cache write failing must not fail the request
  }
  return body;
}

export const posterPath = (path: string | null | undefined, size = "w342") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

/**
 * Delete cache entries nothing will ever be served from again.
 *
 * Every response is written here and none were ever removed, so the directory
 * on the server had reached 51MB across 2,870 files — a discover sweep from a
 * date window that closed weeks ago is kept forever, and is unreachable the
 * moment its query string stops being asked for. Nothing is served past the
 * longest TTL, so anything older than that is dead weight by definition.
 *
 * Failures are swallowed on purpose: this is housekeeping, and a permission
 * error on one file is no reason to fail a refresh that has already done its
 * real work.
 */
export async function pruneCache(maxAgeDays = 14): Promise<{ removed: number; freed: number }> {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  let removed = 0;
  let freed = 0;

  let names: string[];
  try {
    names = await readdir(CACHE_DIR);
  } catch {
    return { removed, freed };
  }

  for (const name of names) {
    const file = join(CACHE_DIR, name);
    try {
      const info = await stat(file);
      if (info.mtimeMs >= cutoff) continue;
      await rm(file);
      removed++;
      freed += info.size;
    } catch {
      // gone already, or not ours to delete
    }
  }
  return { removed, freed };
}
