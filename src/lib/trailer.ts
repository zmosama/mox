/**
 * Which of a title's videos to offer as "the trailer".
 *
 * Studios now post vertical cuts for phones alongside the real trailer, and
 * TMDB lists them the same way: an official "Trailer" with nothing to say it
 * is 9:16. Nobody wants one — not on a computer, not on a phone either.
 *
 * TMDB doesn't record a video's shape and YouTube's oEmbed reports 16:9 for
 * every video, but YouTube does tell a Short apart: /shorts/{key} sends an
 * ordinary video on to /watch and answers 200 for a Short. It also answers
 * 200 for a video that has been taken down, so a 200 is settled by oEmbed:
 * 404 there means gone, which is worth knowing too — a dead link is no trailer.
 *
 * Each answer is kept: a key never changes what it plays. A name that says
 * "vertical" is skipped without asking.
 */

export type Video = { key: string; site: string; type: string; official?: boolean; name?: string };

type Shape = "normal" | "short" | "gone" | "unknown";

const VERTICAL_NAME = /\bvertical\b|#shorts?\b|\b9\s*[:x×]\s*16\b/i;
/** Fight Club's trailer: an ordinary video that YouTube sends from /shorts to /watch. */
const CANARY = "dfeUzm6KF4g";

const known = new Map<string, Shape>();

async function status(url: string, method: "HEAD" | "GET") {
  try {
    const res = await fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(3000) });
    return res.status;
  } catch {
    return 0;
  }
}

async function shape(key: string): Promise<Shape> {
  const hit = known.get(key);
  if (hit) return hit;
  const id = encodeURIComponent(key);
  const s = await status(`https://www.youtube.com/shorts/${id}`, "HEAD");
  let found: Shape = "unknown";
  if (s >= 300 && s < 400) found = "normal";
  else if (s === 200) {
    const o = await status(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`, "GET");
    // 401: it exists but can't be embedded — still a Short, by the first answer.
    found = o === 404 ? "gone" : o === 200 || o === 401 ? "short" : "unknown";
  }
  if (found !== "unknown") known.set(key, found);
  return found;
}

/* If YouTube ever answers /shorts with 200 for everything (a consent page, a
   change on their side), every trailer would look vertical. An hourly look at
   one we know is ordinary turns the check off instead. */
let canary: { at: number; works: Promise<boolean> } | null = null;
function checkWorks(): Promise<boolean> {
  if (!canary || Date.now() - canary.at > 3600_000) {
    known.delete(CANARY);
    canary = { at: Date.now(), works: shape(CANARY).then((s) => s === "normal") };
  }
  return canary.works;
}

/** Official trailers first, then any trailer, then teasers; never a vertical cut or a dead link. */
export async function pickTrailer(videos: Video[] | undefined): Promise<Video | null> {
  const rank = (v: Video) => (v.type === "Trailer" ? (v.official ? 0 : 1) : v.type === "Teaser" ? 2 : 9);
  const candidates = (videos ?? [])
    .filter((v) => v.site === "YouTube" && v.key && rank(v) < 9 && !VERTICAL_NAME.test(v.name ?? ""))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 4);
  if (!candidates.length) return null;
  // Checked together, so a title page waits for one round trip or two at most.
  const [works, shapes] = await Promise.all([checkWorks(), Promise.all(candidates.map((v) => shape(v.key)))]);
  if (!works) return candidates[0];
  return candidates.find((_, i) => shapes[i] === "normal" || shapes[i] === "unknown") ?? null;
}
