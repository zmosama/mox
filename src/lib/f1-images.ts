/**
 * Our own copy of the F1 pictures: the drivers' 2026 portraits, the teams'
 * logos and cars.
 *
 * They are formula1.com's, but served from here: a picture is fetched from
 * their image server the first time anyone asks for it, kept on the data
 * volume beside the database, and from then on comes off our disk — fast,
 * cacheable for good, and still there if formula1.com moves or drops it. The
 * nightly refresh fetches the whole grid ahead of time and renews anything
 * older than a month, so a new livery or portrait arrives on its own.
 *
 * A picture is named by a key, never by a URL, so nothing here can be pointed
 * at any other file or host:
 *   portrait/{team}/{ref}/{face|half|body}   a driver, cropped
 *   team/{slug}/{logo|car}                   a team's white logo, its car
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DIR = join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "f1-images");
const F1 = "https://media.formula1.com/image/upload";
const VERSION = "v1740000001";

const CROPS = {
  /** A square around the face, for avatars. */
  face: "c_thumb,g_face,w_256,h_256,z_0.6",
  /** Head to waist, for a team's pair. */
  half: "c_crop,g_north,w_1.0,h_0.5/c_scale,w_520",
  /** Head to toe, for a driver's page. */
  body: "c_lfill,w_700",
} as const;
export type Crop = keyof typeof CROPS;

const PORTRAIT = /^portrait\/([a-z0-9]{2,40})\/([a-z]{6}\d{2})\/(face|half|body)$/;
const TEAM = /^team\/([a-z0-9]{2,40})\/(logo|car)$/;

/** Where formula1.com keeps the picture a key names; null for anything that is not one. */
export function upstream(key: string): string | null {
  const p = PORTRAIT.exec(key);
  if (p) {
    const [, team, ref, crop] = p;
    return `${F1}/${CROPS[crop as Crop]}/q_auto/${VERSION}/common/f1/2026/${team}/${ref}/2026${team}${ref}right.webp`;
  }
  const t = TEAM.exec(key);
  if (t) {
    const [, slug, kind] = t;
    return kind === "logo"
      ? `${F1}/c_fit,h_160/q_auto/${VERSION}/common/f1/2026/${slug}/2026${slug}logowhite.webp`
      : `${F1}/c_fit,w_1000/q_auto/${VERSION}/common/f1/2026/${slug}/2026${slug}carright.webp`;
  }
  return null;
}

/** The path a page or the app loads a picture from — ours, not formula1.com's. */
export const imagePath = (key: string) => `/api/f1/img/${key}`;

const fileFor = (key: string) => join(DIR, `${key}.webp`);
const fetching = new Map<string, Promise<Buffer | null>>();

/** Download one picture into the mirror. Several asking at once share one download. */
function download(key: string): Promise<Buffer | null> {
  const running = fetching.get(key);
  if (running) return running;
  const url = upstream(key);
  if (!url) return Promise.resolve(null);
  const job = (async () => {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "mox (https://mox.mosama.me)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      const file = fileFor(key);
      await mkdir(dirname(file), { recursive: true });
      // Written whole, then moved into place: a reader never sees half a file.
      await writeFile(`${file}.part`, bytes);
      await rename(`${file}.part`, file);
      return bytes;
    } catch {
      return null;
    } finally {
      fetching.delete(key);
    }
  })();
  fetching.set(key, job);
  return job;
}

/** A picture's bytes: from our disk, or fetched once and kept. Null if there is no such picture. */
export async function f1Image(key: string): Promise<Buffer | null> {
  if (!upstream(key)) return null;
  try {
    return await readFile(fileFor(key));
  } catch {
    return download(key);
  }
}

/**
 * Make sure every key is on disk, and renew the ones older than `maxAgeDays`.
 * A renewal that fails keeps the copy we have — the point of the mirror.
 */
export async function warmF1Images(keys: string[], maxAgeDays = 30) {
  let fetched = 0;
  let kept = 0;
  let missing = 0;
  for (const key of keys) {
    const age = await stat(fileFor(key)).then((s) => Date.now() - s.mtimeMs).catch(() => null);
    if (age !== null && age < maxAgeDays * 86400_000) {
      kept++;
      continue;
    }
    // One at a time: a nightly job has no hurry, and formula1.com is not ours.
    if (await download(key)) fetched++;
    else if (age !== null) kept++;
    else missing++;
  }
  return { fetched, kept, missing };
}
