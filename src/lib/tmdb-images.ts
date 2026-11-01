/**
 * Our own copy of TMDB's pictures, kept as they are asked for.
 *
 * Pages and the app load a poster from /api/img/{size}/{file} instead of
 * image.tmdb.org. The first time anyone asks for one it is fetched from TMDB
 * and kept on the data volume beside the database; from then on it comes off
 * our disk. Nothing is fetched ahead of time: what people actually look at —
 * the home page, the news, what they search and open — is what collects here,
 * and it stays if TMDB is ever down.
 *
 * TMDB names a file by its content, so a file once kept never changes and
 * never needs renewing.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DIR = join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "tmdb-images");
const TMDB = "https://image.tmdb.org/t/p";

/* Only TMDB's own sizes and file names, so a request can never name another
   host, climb out of the folder, or ask for "original" (several megabytes). */
const SIZE = /^(w\d{2,4}|h\d{2,4})$/;
const FILE = /^[A-Za-z0-9_-]{4,80}\.(jpg|png|svg|webp)$/;

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml", webp: "image/webp" };

export const tmdbImageUrl = (size: string, file: string) => `${TMDB}/${size}/${file}`;

export function validImage(size: string, file: string) {
  return SIZE.test(size) && FILE.test(file);
}

export const imageType = (file: string) => TYPES[file.slice(file.lastIndexOf(".") + 1)];

const fileFor = (size: string, file: string) => join(DIR, size, file);
const fetching = new Map<string, Promise<Buffer | null>>();

/** Download one picture and keep it. Several asking at once share one download. */
function download(size: string, file: string): Promise<Buffer | null> {
  const id = `${size}/${file}`;
  const running = fetching.get(id);
  if (running) return running;
  const job = (async () => {
    try {
      const res = await fetch(tmdbImageUrl(size, file), {
        headers: { "user-agent": "mox (https://mox.mosama.me)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      const path = fileFor(size, file);
      await mkdir(dirname(path), { recursive: true });
      // Written whole, then moved into place: a reader never sees half a file.
      await writeFile(`${path}.part`, bytes);
      await rename(`${path}.part`, path);
      return bytes;
    } catch {
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
