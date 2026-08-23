/**
 * The taste model. No AI — weighted counting with three corrections.
 *
 * A straight tally does not work here: with 229 loves against 10 dislikes it
 * concludes "you like everything". So:
 *
 *   1. Deviation, not volume. A feature scores by how far it pulls a verdict
 *      *above your own average*, so a feature rated exactly at that average
 *      contributes nothing.
 *   2. Rarity. "action" sits on most of the catalog and says almost nothing;
 *      "time loop" sits on a handful. An idf term lets the specific outweigh
 *      the broad.
 *   3. Confidence. Rarity makes a feature loud, so two ratings must not shout:
 *      n/(n+2) damps thin evidence.
 *
 * And a sparse prior, because a title we know almost nothing about should score
 * near zero rather than near the top — reality shows carry no keywords, no
 * recurring cast and no collection, and once outranked every drama.
 *
 * src/lib/taste.test.ts checks this against the Python implementation's own
 * output; change a number here and that test tells you exactly what moved.
 */
import type { FeatureKind, Verdict } from "@/db/schema";

export const WEIGHT: Record<Verdict, number> = {
  love: 2.0,
  like: 1.0,
  dislike: -1.5,
  watchlist: 0.5,
  hidden: -1.0,
  seen: 0.0,
};

export const PRIOR = 3.0;
export const SPARSE_PRIOR = 12.0;
export const CONFIDENCE_PRIOR = 2.0;

export const KIND_WEIGHT: Record<FeatureKind, number> = {
  collection: 3.0,
  keyword: 2.0,
  person: 2.0,
  genre: 1.0,
  company: 0.6,
  lang: 1.0,
  decade: 0.4,
};

/** TMDB names genres differently for film and TV; fold them onto one vocabulary. */
const CANON: Record<string, string[]> = {
  "science fiction": ["sci-fi"],
  "sci-fi & fantasy": ["sci-fi", "fantasy"],
  "action & adventure": ["action", "adventure"],
  "war & politics": ["war"],
  biography: ["drama"],
};

/**
 * Tags describing how a title was made or packaged rather than what it is.
 * "aftercreditsstinger" sits on 58 rated titles purely because Marvel does it
 * every time, and read as the single clearest taste signal in the model.
 */
export const KEYWORD_STOPLIST = new Set([
  "aftercreditsstinger",
  "duringcreditsstinger",
  "post credits scene",
  "short film",
  "3d animation",
  "imax",
  "based on comic",
  "woman director",
  "live action remake",
  "sequel",
  "prequel",
  "reboot",
  "spin off",
  // TMDB mood adjectives: vague, and attached to almost everything.
  "cheerful",
  "intense",
  "excited",
  "hilarious",
  // TMDB spells this with the accent; dropping it silently stopped excluding it.
  "cliché",
  "cautionary",
  "touching",
  "absurd",
  "gripping",
  "emotional",
  "suspenseful",
]);

export function canon(genres: readonly string[]): string[] {
  const out: string[] = [];
  for (const g of genres) out.push(...(CANON[g] ?? [g]));
  return [...new Set(out)];
}

export type Feature = { feature: FeatureKind; value: string };
export type RatedTitle = { tmdbId: number; verdict: Verdict; features: Feature[] };
export type Scorable = { tmdbId: number; features: Feature[] };
export type Contribution = Feature & { weight: number; seen: number };

/**
 * Features are keyed by kind and value joined together. The separator has to be
 * something that cannot occur inside a keyword, a cast name or a collection:
 * joining on a space and splitting on it again truncated every multi-word
 * value, so "space travel" came back as "space".
 */
const SEP = "␟";

export const featureKey = (f: Feature) => `${f.feature}${SEP}${f.value}`;

const parseKey = (key: string): Feature => {
  const at = key.indexOf(SEP);
  return { feature: key.slice(0, at) as FeatureKind, value: key.slice(at + 1) };
};

export class TasteModel {
  readonly mean: number;
  private readonly affinity = new Map<string, number>();
  private readonly count = new Map<string, number>();
  private readonly df = new Map<string, number>();
  private readonly n: number;

  /**
   * @param rated  every title judged, with its features
   * @param corpus every title known — this is what sets how common a feature is
   */
  constructor(rated: readonly RatedTitle[], corpus: readonly Scorable[]) {
    const weights = rated.map((r) => WEIGHT[r.verdict]);
    this.mean = weights.length
      ? weights.reduce((a, b) => a + b, 0) / weights.length
      : 0;

    this.n = Math.max(corpus.length, 1);
    for (const item of corpus) {
      for (const key of uniqueKeys(item.features)) {
        this.df.set(key, (this.df.get(key) ?? 0) + 1);
      }
    }

    const total = new Map<string, number>();
    for (const r of rated) {
      const w = WEIGHT[r.verdict];
      for (const key of uniqueKeys(r.features)) {
        total.set(key, (total.get(key) ?? 0) + w);
        this.count.set(key, (this.count.get(key) ?? 0) + 1);
      }
    }
    for (const [key, sum] of total) {
      const seen = this.count.get(key) ?? 0;
      this.affinity.set(key, (sum + PRIOR * this.mean) / (seen + PRIOR) - this.mean);
    }
  }

  idf(key: string): number {
    return Math.log(this.n / (1 + (this.df.get(key) ?? 0))) + 1.0;
  }

  confidence(key: string): number {
    const seen = this.count.get(key) ?? 0;
    return seen / (seen + CONFIDENCE_PRIOR);
  }

  /** Weighted mean contribution, shrunk toward zero when evidence is thin. */
  score(item: Scorable): number {
    let parts = 0;
    let weights = 0;
    for (const f of uniqueFeatures(item.features)) {
      const key = featureKey(f);
      const kw = KIND_WEIGHT[f.feature] * this.idf(key) * this.confidence(key);
      weights += kw;
      parts += (this.affinity.get(key) ?? 0) * kw;
    }
    return parts / (weights + SPARSE_PRIOR);
  }

  contributions(item: Scorable): Contribution[] {
    const out: Contribution[] = [];
    for (const f of uniqueFeatures(item.features)) {
      const key = featureKey(f);
      const a = this.affinity.get(key);
      if (a === undefined) continue;
      out.push({
        ...f,
        weight: a * this.idf(key) * this.confidence(key) * KIND_WEIGHT[f.feature],
        seen: this.count.get(key) ?? 0,
      });
    }
    return out.sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight));
  }

  /** Features ranked by how far above your average they sit. */
  strongest(feature: FeatureKind, minSeen = 4, limit = 10) {
    const rows: {
      feature: FeatureKind;
      value: string;
      affinity: number;
      seen: number;
    }[] = [];
    for (const [key, affinity] of this.affinity) {
      const { feature: kind, value } = parseKey(key);
      if (kind !== feature) continue;
      const seen = this.count.get(key) ?? 0;
      if (seen < minSeen) continue;
      rows.push({ feature, value, affinity, seen });
    }
    // Ties are common — four keywords share 0.422628 here — so break them by
    // name, or the order is whatever the map happened to be built in.
    return rows
      .sort((a, b) => b.affinity - a.affinity || a.value.localeCompare(b.value))
      .slice(0, limit);
  }
}

function uniqueFeatures(features: readonly Feature[]): Feature[] {
  const seen = new Set<string>();
  const out: Feature[] = [];
  for (const f of features) {
    if (f.feature === "keyword" && KEYWORD_STOPLIST.has(f.value)) continue;
    const values = f.feature === "genre" ? canon([f.value]) : [f.value];
    for (const value of values) {
      const key = featureKey({ feature: f.feature, value });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ feature: f.feature, value });
    }
  }
  return out;
}

const uniqueKeys = (features: readonly Feature[]) =>
  uniqueFeatures(features).map(featureKey);
