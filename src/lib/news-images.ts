/**
 * Our own small copy of a sports story's picture.
 *
 * Formula1.com hands out 2048px pictures and Motorsport's run to 400KB — a
 * phone draws them 124px wide. Each is fetched once when the story arrives,
 * made a 640px WebP (a few tens of KB), kept beside the database and served
 * from /api/news/img/{hash}.webp for good. If the newsroom later moves or
 * drops it, ours stays.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DIR = join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "news-images");
/** Only the newsrooms we read: a stored address can never make us fetch from anywhere else. */
const HOSTS = /^https:\/\/(cdn-\d+\.motorsport\.com|media\.formula1\.com)\//;
const MAX_BYTES = 8 * 1024 * 1024;

export const NEWS_IMAGE_NAME = /^[a-f0-9]{32}\.webp$/;
const fileFor = (name: string) => join(DIR, name);

/** Fetch, shrink and keep one picture; its local address, or null to show none. */
export async function keepNewsImage(url: string | null): Promise<string | null> {
  if (!url || !HOSTS.test(url)) return null;
  const name = `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.webp`;
  const path = fileFor(name);
  try {
    await readFile(path);
    return `/api/news/img/${name}`;
  } catch {
    // not kept yet
  }
  try {
    // Redirects followed by hand, each hop checked against the same short list of hosts.
    let target = url;
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(target, { headers: { "user-agent": "mox (https://mox.mosama.me)" }, signal: AbortSignal.timeout(10_000), redirect: "manual" });
      if (res.status < 300 || res.status >= 400) break;
      const next = res.headers.get("location") ? new URL(res.headers.get("location")!, target).href : null;
      if (!next || !HOSTS.test(next)) return null;
      target = next;
      res = null;
    }
    if (!res || !res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    const { default: sharp } = await import("sharp");
    const small = await sharp(bytes).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
    await mkdir(DIR, { recursive: true });
    await writeFile(`${path}.part`, small);
    await rename(`${path}.part`, path);
    return `/api/news/img/${name}`;
  } catch (e) {
    console.error(`news-images: could not keep ${url}:`, (e as Error).message);
    return null;
  }
}

export async function readNewsImage(name: string): Promise<Buffer | null> {
  if (!NEWS_IMAGE_NAME.test(name)) return null;
  return readFile(fileFor(name)).catch(() => null);
}
