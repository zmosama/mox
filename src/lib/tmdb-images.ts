/**
 * Our own copy of TMDB's pictures, kept as they are asked for.
 *
 * Pages and the app load a poster from /api/img/{size}/{file} instead of
 * image.tmdb.org. The first time anyone asks for one it is fetched from TMDB
 * and kept on the data volume beside the database; from then on it comes off
 * our disk. Nothing is fetched ahead of time except the home page's big
 * pictures (warmTmdbImages, nightly): what people actually look at — the home
 * page, the news, what they search and open — is what collects here, and what
 * is here stays if TMDB is ever down.
 *
 * TMDB names a file by its content, so a file once kept never changes and
 * never needs renewing. The folder is not in the daily backup: it fills again
 * on its own.
 */
import { mkdir, readFile, rename, statfs, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { KEPT_SIZES, TMDB_FILE_NAME } from "./images";

const DIR = join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "tmdb-images");
const TMDB = "https://image.tmdb.org/t/p";

/** Below this much free disk, pictures are still passed on but no longer kept. */
const KEEP_FREE = 5 * 1024 ** 3;
/** A picture is shown from TMDB if it takes longer than this to fetch for ourselves. */
const TIMEOUT = 5000;

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml", webp: "image/webp" };

export const tmdbImageUrl = (size: string, file: string) => `${TMDB}/${size}/${file}`;

/* Only the sizes we use and TMDB's own file names, so a request can never name
   another host, climb out of the folder, or fill the disk with sizes nobody shows. */
export function validImage(size: string, file: string) {
  return KEPT_SIZES.has(size) && TMDB_FILE_NAME.test(file);
}

export const imageType = (file: string) => TYPES[file.slice(file.lastIndexOf(".") + 1)];

const fileFor = (size: string, file: string) => join(DIR, size, file);
const fetching = new Map<string, Promise<Buffer | null>>();

/* Pictures we couldn't get, and until when not to ask again: a file TMDB says
   isn't there for a day, a failed or slow fetch for a minute. Without this a
   missing poster cost a trip to TMDB on every view. */
const misses = new Map<string, number>();
function missed(id: string, ms: number) {
  if (misses.size > 10_000) misses.clear();
  misses.set(id, Date.now() + ms);
}

/** Checked at most once a minute: statfs is cheap but this runs per new picture. */
let room = { at: 0, ok: true };
async function roomToKeep() {
  if (Date.now() - room.at > 60_000) {
    const s = await statfs(dirname(DIR)).catch(() => null);
    room = { at: Date.now(), ok: !s || s.bavail * s.bsize > KEEP_FREE };
    if (!room.ok) console.error(`tmdb-images: under ${KEEP_FREE / 1024 ** 3}GB free, not keeping new pictures`);
  }
  return room.ok;
}

async function keep(size: string, file: string, bytes: Buffer) {
  if (!(await roomToKeep())) return;
  const path = fileFor(size, file);
  try {
    await mkdir(dirname(path), { recursive: true });
    // Written whole, then moved into place: a reader never sees half a file.
    await writeFile(`${path}.part`, bytes);
    await rename(`${path}.part`, path);
  } catch (e) {
    console.error(`tmdb-images: could not keep ${size}/${file}:`, (e as Error).message);
    await unlink(`${path}.part`).catch(() => {});
  }
}

/** Download one picture and keep it. Several asking at once share one download. */
function download(size: string, file: string): Promise<Buffer | null> {
  const id = `${size}/${file}`;
  const running = fetching.get(id);
  if (running) return running;
  const until = misses.get(id);
  if (until && until > Date.now()) return Promise.resolve(null);
  const job = (async () => {
    try {
      const res = await fetch(tmdbImageUrl(size, file), {
        headers: { "user-agent": "mox (https://mox.mosama.me)" },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
        missed(id, res.status === 404 ? 86_400_000 : 60_000);
        return null;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      // An empty answer kept would be served, cached for good, as a blank.
      if (!bytes.length) {
        missed(id, 60_000);
        return null;
      }
      misses.delete(id);
      // Shown either way; kept if it can be.
      await keep(size, file, bytes);
      return bytes;
    } catch {
      missed(id, 60_000);
      return null;
    } finally {
      fetching.delete(id);
    }
  })();
  fetching.set(id, job);
  return job;
}

/** A picture's bytes: from our disk, or fetched once and kept. Null if TMDB has no such file or can't be reached. */
export async function tmdbImage(size: string, file: string): Promise<Buffer | null> {
  if (!validImage(size, file)) return null;
  try {
    return await readFile(fileFor(size, file));
  } catch {
    return download(size, file);
  }
}

/**
 * Fetch ahead the pictures every visitor sees first, so the first one each
 * morning isn't waiting on TMDB. One at a time: this runs on the nightly box.
 */
export async function warmTmdbImages(urls: string[]) {
  let fetched = 0;
  let kept = 0;
  let missing = 0;
  for (const url of new Set(urls)) {
    const m = /\/t\/p\/([^/]+)\/([^/]+)$/.exec(url);
    if (!m || !validImage(m[1], m[2])) continue;
    const had = await readFile(fileFor(m[1], m[2])).then(() => true, () => false);
    if (had) kept++;
    else if (await download(m[1], m[2])) fetched++;
    else missing++;
  }
  return { fetched, kept, missing };
}
