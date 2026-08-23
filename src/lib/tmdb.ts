/**
 * TMDB client with a disk cache.
 *
 * Provider listings and genre names barely move, and re-fetching them per page
 * load once cost the board a round trip per watchlist item. Cached responses
 * are keyed by path and query, with a per-endpoint lifetime.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

export async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const clean = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ) as Record<string, string>;
  const file = cachePath(path, clean);
  const ttl = ttlFor(path);

  try {
    const raw = await readFile(file, "utf8");
    const { at, body } = JSON.parse(raw) as { at: number; body: T };
    if (Date.now() - at < ttl * 1000) return body;
  } catch {
    // no usable cache entry
  }

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(clean)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey());

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new TmdbError(`TMDB ${res.status} on ${path}`);
  const body = (await res.json()) as T;

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
