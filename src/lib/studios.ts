/**
 * The studios tab: the companies whose name alone is a reason to watch,
 * in order of how often that is true.
 *
 * Searching "disney" was how people asked for this before it existed, and a
 * text search is the wrong tool — it matches titles with the word in them,
 * not what the studio made. TMDB's discover by company (films) and by network
 * (series) is the right one: every title is the studio's, and it sorts.
 *
 * A fixed list, kept here, because which studios matter is a judgement and
 * not something TMDB can rank. Every id was checked against TMDB's own
 * /company and /network records on 4 October 2026.
 */
import type { MediaKind } from "@/db/schema";

type Source = { companies?: number[]; networks?: number[] };

export type Studio = {
  slug: string;
  name: string;
  /** TMDB's logo, mostly dark lines on nothing: drawn on a light tile. */
  logo: string;
  movie?: Source;
  tv?: Source;
  /** Which list opens first, when it makes both. */
  first?: MediaKind;
};

export const STUDIOS: Studio[] = [
  { slug: "disney", name: "Disney", logo: "/wdrCwmRnLFJhEoH8GSfymY85KHT.png", movie: { companies: [2, 6125] }, tv: { networks: [2739, 54] } },
  { slug: "marvel", name: "Marvel Studios", logo: "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png", movie: { companies: [420] }, tv: { companies: [420] } },
  { slug: "pixar", name: "Pixar", logo: "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png", movie: { companies: [3] } },
  { slug: "lucasfilm", name: "Lucasfilm", logo: "/tlVSws0RvvtPBwViUyOFAO0vcQS.png", movie: { companies: [1] }, tv: { companies: [1] } },
  { slug: "a24", name: "A24", logo: "/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png", movie: { companies: [41077] }, tv: { companies: [41077] } },
  { slug: "hbo", name: "HBO", logo: "/tuomPhY2UtuPTqqFnKMVHvSb724.png", tv: { networks: [49, 3186] }, movie: { companies: [7429, 3268] }, first: "tv" },
  { slug: "netflix", name: "Netflix", logo: "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png", tv: { networks: [213] }, movie: { companies: [178464, 145174] }, first: "tv" },
  { slug: "warner-bros", name: "Warner Bros.", logo: "/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png", movie: { companies: [174] }, tv: { companies: [1957] } },
  { slug: "universal", name: "Universal", logo: "/8lvHyhjr8oUKOOy2dKXoALWKdp0.png", movie: { companies: [33] } },
  { slug: "paramount", name: "Paramount", logo: "/jay6WcMgagAklUt7i9Euwj1pzTF.png", movie: { companies: [4] }, tv: { networks: [4330] } },
  { slug: "apple", name: "Apple TV", logo: "/bngHRFi794mnMq34gfVcm9nDxN1.png", tv: { networks: [2552] }, movie: { companies: [194232] }, first: "tv" },
  { slug: "prime-video", name: "Prime Video", logo: "/w7HfLNm9CWwRmAMU58udl2L7We7.png", tv: { networks: [1024] }, movie: { companies: [210099, 20580] }, first: "tv" },
  { slug: "columbia", name: "Columbia Pictures", logo: "/71BqEFAF4V3qjjMPCpLuyJFB9A.png", movie: { companies: [5] } },
  { slug: "20th-century", name: "20th Century", logo: "/h0rjX5vjW5r8yEnUBStFarjcLT4.png", movie: { companies: [127928, 25] } },
  { slug: "ghibli", name: "Studio Ghibli", logo: "/uFuxPEZRUcBTEiYIxjHJq62Vr77.png", movie: { companies: [10342] } },
  { slug: "dreamworks-animation", name: "DreamWorks Animation", logo: "/3BPX5VGBov8SDqTV7wC1L1xShAS.png", movie: { companies: [521] } },
  { slug: "legendary", name: "Legendary", logo: "/5UQsZrfbfG2dYJbx8DxfoTr2Bvu.png", movie: { companies: [923] } },
  { slug: "searchlight", name: "Searchlight", logo: "/7DLKyL15ETI9645XSr9JcbMV79c.png", movie: { companies: [127929, 43] } },
  { slug: "neon", name: "NEON", logo: "/3K9wCZTyDgop3ITK1rDi6T2PckE.png", movie: { companies: [90733] } },
  { slug: "blumhouse", name: "Blumhouse", logo: "/rzKluDcRkIwHZK2pHsiT667A2Kw.png", movie: { companies: [3172] }, tv: { companies: [3172] } },
  { slug: "illumination", name: "Illumination", logo: "/fOG2oY4m1YuYTQh4bMqqZkmgOAI.png", movie: { companies: [6704] } },
  { slug: "lionsgate", name: "Lionsgate", logo: "/cisLn1YAUuptXVBa0xjq7ST9cH0.png", movie: { companies: [1632] } },
  { slug: "focus", name: "Focus Features", logo: "/xnFIOeq5cKw09kCWqV7foWDe4AA.png", movie: { companies: [10146] } },
  { slug: "new-line", name: "New Line", logo: "/2ycs64eqV5rqKYHyQK0GVoKGvfX.png", movie: { companies: [12] } },
  { slug: "mgm", name: "MGM", logo: "/usUnaYV6hQnlVAXP6r4HwrlLFPG.png", movie: { companies: [21] } },
  { slug: "amblin", name: "Amblin", logo: "/cEaxANEisCqeEoRvODv2dO1I0iI.png", movie: { companies: [56] } },
  { slug: "plan-b", name: "Plan B", logo: "/8wOfUhA7vwU2gbPjQy7Vv3EiF0o.png", movie: { companies: [81] } },
  { slug: "annapurna", name: "Annapurna", logo: "/pfUB1a62jSMIqp4Xmaq6z2cgW0B.png", movie: { companies: [13184] } },
  { slug: "bad-robot", name: "Bad Robot", logo: "/p9FoEt5shEKRWRKVIlvFaEmRnun.png", movie: { companies: [11461] }, tv: { companies: [11461] } },
  { slug: "sony-animation", name: "Sony Pictures Animation", logo: "/5ilV5mH3gxTEU7p5wjxptHvXkyr.png", movie: { companies: [2251] } },
  { slug: "toho", name: "Toho", logo: "/fRSWWjquvzcHjACbtF53utZFIll.png", movie: { companies: [882] } },
  { slug: "fx", name: "FX", logo: "/aexGjtcs42DgRtZh7zOxayiry4J.png", tv: { networks: [88] } },
  { slug: "hulu", name: "Hulu", logo: "/pqUTCleNUiTLAVlelGxUgWn1ELh.png", tv: { networks: [453] } },
  { slug: "showtime", name: "Showtime", logo: "/Allse9kbjiP6ExaQrnSpIhkurEi.png", tv: { networks: [67] } },
  { slug: "amc", name: "AMC", logo: "/pmvRmATOCaDykE6JrVoeYxlFHw3.png", tv: { networks: [174] } },
];

export const SORTS = ["popular", "top", "newest"] as const;
export type StudioSort = (typeof SORTS)[number];

export const studioBySlug = (slug: string) => STUDIOS.find((s) => s.slug === slug);

/** Films, series or both, in the order the studio's tab shows them. */
export function kindsOf(s: Studio): MediaKind[] {
  const kinds: MediaKind[] = [];
  if (s.movie) kinds.push("movie");
  if (s.tv) kinds.push("tv");
  return s.first === "tv" ? kinds.reverse() : kinds;
}

export const logoUrl = (path: string) => `https://image.tmdb.org/t/p/w300${path}`;

/**
 * TMDB discover parameters for one studio's list. "Top" asks for enough votes
 * that a film three people rated 10 does not lead; "newest" stops at today,
 * so announced titles with a date years out do not fill the first page.
 */
export function discoverParams(s: Studio, kind: MediaKind, sort: StudioSort, today: string) {
  const src = kind === "movie" ? s.movie : s.tv;
  if (!src) return null;
  const params: Record<string, string> = { include_adult: "false" };
  if (src.companies?.length) params.with_companies = src.companies.join("|");
  if (src.networks?.length) params.with_networks = src.networks.join("|");
  const date = kind === "movie" ? "primary_release_date" : "first_air_date";
  if (sort === "popular") params.sort_by = "popularity.desc";
  if (sort === "top") {
    params.sort_by = "vote_average.desc";
    params["vote_count.gte"] = kind === "movie" ? "300" : "150";
  }
  if (sort === "newest") {
    params.sort_by = `${date}.desc`;
    params[`${date}.lte`] = today;
  }
  return params;
}
