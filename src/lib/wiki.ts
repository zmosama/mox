/**
 * A Wikipedia page's lead: its photo and its opening paragraph.
 *
 * F1 drivers and teams have no pictures in Jolpica, but every one of them
 * links to their Wikipedia page, and Wikipedia's summary endpoint hands back a
 * freely licensed photo with the first paragraph. Kept in memory for a week —
 * a driver's face does not change between races — and a page that has none is
 * remembered for a day, so it is not asked for again on every load.
 */
export type WikiSummary = {
  title: string;
  extract: string;
  /** About 330px across: for lists and rows. */
  thumb: string | null;
  /** About 960px across: for a page's header. */
  image: string | null;
  url: string;
};

const cache = new Map<string, { at: number; value: WikiSummary | null }>();
const WEEK = 7 * 86400_000;
const DAY = 86400_000;

/** "http://en.wikipedia.org/wiki/Max_Verstappen" → "Max_Verstappen". */
export function wikiTitle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /wikipedia\.org\/wiki\/([^?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Wikimedia serves thumbnails at fixed widths; pick one of them. */
function resized(src: string, width: number): string {
  return src.replace(/\/\d+px-/, `/${width}px-`).replace(/[?&]utm_[^&]*/g, "").replace(/\?$/, "");
}

export async function wikiSummary(url: string | null | undefined): Promise<WikiSummary | null> {
  const title = wikiTitle(url);
  if (!title) return null;
  const hit = cache.get(title);
  if (hit && Date.now() - hit.at < (hit.value ? WEEK : DAY)) return hit.value;
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { "user-agent": "mox (https://mox.mosama.me)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
    const body = (await res.json()) as {
      title: string;
      extract?: string;
      thumbnail?: { source: string };
      content_urls?: { desktop?: { page?: string } };
    };
    const thumb = body.thumbnail?.source ?? null;
    const value: WikiSummary = {
      title: body.title,
      extract: body.extract ?? "",
      thumb: thumb ? resized(thumb, 330) : null,
      image: thumb ? resized(thumb, 960) : null,
      url: body.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`,
    };
    cache.set(title, { at: Date.now(), value });
    return value;
  } catch {
    // Keep the last good answer; with none, remember the miss for a while.
    if (hit) return hit.value;
    cache.set(title, { at: Date.now() - WEEK + DAY, value: null });
    return null;
  }
}
