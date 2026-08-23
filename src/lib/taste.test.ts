import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { canon, TasteModel, type Feature, type RatedTitle, type Scorable } from "./taste";
import type { FeatureKind, MediaKind, Verdict } from "@/db/schema";

describe("TasteModel", () => {
  const corpus: Scorable[] = [
    { tmdbId: 1, features: [{ feature: "keyword", value: "time loop" }] },
    { tmdbId: 2, features: [{ feature: "keyword", value: "time loop" }] },
    { tmdbId: 3, features: [{ feature: "keyword", value: "courtroom" }] },
    { tmdbId: 4, features: [{ feature: "keyword", value: "courtroom" }] },
    { tmdbId: 5, features: [] },
  ];
  const rated: RatedTitle[] = [
    { tmdbId: 1, verdict: "love", features: corpus[0].features },
    { tmdbId: 2, verdict: "like", features: corpus[1].features },
    { tmdbId: 3, verdict: "dislike", features: corpus[2].features },
    { tmdbId: 4, verdict: "hidden", features: corpus[3].features },
  ];
  const model = new TasteModel(rated, corpus);

  it("ranks a repeatedly liked feature above a repeatedly disliked one", () => {
    expect(model.score(corpus[0])).toBeGreaterThan(model.score(corpus[2]));
  });

  it("keeps featureless titles at the sparse prior", () => {
    expect(model.score(corpus[4])).toBe(0);
  });

  it("canonicalizes TMDB's film and TV genre vocabularies", () => {
    expect(canon(["science fiction", "sci-fi & fantasy"])).toEqual(["sci-fi", "fantasy"]);
  });
});

type Golden = {
  ratedCount: number;
  mean: number;
  featureCount: number;
  top50: { tmdbId: number; kind: MediaKind; title: string; score: number }[];
  bottom20: { tmdbId: number; kind: MediaKind; title: string; score: number }[];
  keywords: [string, number, number][];
};

const hasPrivateGoldenData =
  existsSync("legacy/golden.json") &&
  existsSync("legacy/catalog.json") &&
  existsSync(process.env.MOX_DB ?? "./data/mox.db");

if (hasPrivateGoldenData) {
  const golden = JSON.parse(readFileSync("legacy/golden.json", "utf8")) as Golden;
  const catalog = JSON.parse(readFileSync("legacy/catalog.json", "utf8")) as {
    tmdb_id: number | null;
    type: MediaKind;
  }[];
  const inCatalog = new Set(
    catalog.filter((c) => c.tmdb_id).map((c) => `${c.tmdb_id}:${c.type}`),
  );

  function loadGoldenCorpus() {
    const sqlite = new Database(process.env.MOX_DB ?? "./data/mox.db", { readonly: true });
    const featureRows = sqlite
      .prepare("SELECT tmdb_id, kind, feature, value FROM features")
      .all() as { tmdb_id: number; kind: MediaKind; feature: FeatureKind; value: string }[];

    const byTitle = new Map<string, Feature[]>();
    for (const row of featureRows) {
      const key = `${row.tmdb_id}:${row.kind}`;
      byTitle.set(key, [...(byTitle.get(key) ?? []), { feature: row.feature, value: row.value }]);
    }

    const titleRows = (
      sqlite.prepare("SELECT tmdb_id, kind, title FROM titles").all() as {
        tmdb_id: number;
        kind: MediaKind;
        title: string;
      }[]
    ).filter((title) => inCatalog.has(`${title.tmdb_id}:${title.kind}`));
    const verdictRows = sqlite
      .prepare("SELECT tmdb_id, kind, verdict FROM verdicts")
      .all() as { tmdb_id: number; kind: MediaKind; verdict: Verdict }[];
    const verdictOf = new Map(
      verdictRows.map((verdict) => [`${verdict.tmdb_id}:${verdict.kind}`, verdict.verdict]),
    );

    const corpus: (Scorable & { kind: MediaKind; title: string })[] = titleRows.map((title) => ({
      tmdbId: title.tmdb_id,
      kind: title.kind,
      title: title.title,
      features: byTitle.get(`${title.tmdb_id}:${title.kind}`) ?? [],
    }));
    const rated: RatedTitle[] = [];
    for (const title of corpus) {
      const verdict = verdictOf.get(`${title.tmdbId}:${title.kind}`);
      if (verdict) rated.push({ tmdbId: title.tmdbId, verdict, features: title.features });
    }
    sqlite.close();
    return { corpus, rated };
  }

  describe("TasteModel private legacy differential", () => {
    const { corpus, rated } = loadGoldenCorpus();
    const model = new TasteModel(rated, corpus);
    const scored = corpus
      .map((item) => ({ ...item, score: model.score(item) }))
      .sort((a, b) => b.score - a.score || a.tmdbId - b.tmdbId);

    it("uses the reference corpus", () => {
      expect(corpus.length).toBe(inCatalog.size);
      expect(rated.length).toBe(golden.ratedCount);
    });

    it("agrees on the viewer's mean", () => {
      expect(model.mean).toBeCloseTo(golden.mean, 5);
    });

    it("reproduces the top and bottom ranking", () => {
      const top = scored.slice(0, golden.top50.length);
      const bottom = scored.slice(-golden.bottom20.length);
      expect(top.map((row) => row.title)).toEqual(golden.top50.map((row) => row.title));
      expect(bottom.map((row) => row.title)).toEqual(golden.bottom20.map((row) => row.title));
      golden.top50.forEach((want, index) => expect(top[index].score).toBeCloseTo(want.score, 5));
      golden.bottom20.forEach((want, index) =>
        expect(bottom[index].score).toBeCloseTo(want.score, 5),
      );
    });

    it("reproduces the strongest keywords", () => {
      const strongest = model.strongest("keyword", 4, golden.keywords.length);
      expect(strongest.map((row) => row.value)).toEqual(golden.keywords.map(([value]) => value));
      golden.keywords.forEach(([value, affinity, seen], index) => {
        expect(strongest[index].affinity, value).toBeCloseTo(affinity, 5);
        expect(strongest[index].seen, value).toBe(seen);
      });
    });
  });
} else {
  describe("TasteModel private legacy differential", () => {
    it.skip("runs only when the private legacy data and local database are present", () => {});
  });
}
