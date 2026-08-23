"""Emit the Python model's numbers for the differential test.

    python3 scripts/golden.py ./legacy > legacy/golden.json

Must be pointed at the SAME snapshot the database was imported from — running it
against a different data directory silently produces a reference the port can
never match.
"""
import json, os, sys

SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "./legacy")
PY_SRC = os.path.expanduser("~/Work/MOX/streaming-picks/src")
sys.path.insert(0, PY_SRC)

import store, taste
store.DATA = __import__("pathlib").Path(SRC)   # read the snapshot, not the live app

cat = store.load_catalog()
ratings = store.load_ratings()
feats = store._read(store.DATA / "features.json", {})
m = taste.Model(cat, ratings, feats)

scored = []
for i in cat:
    if not i.get("tmdb_id"):
        continue
    scored.append({"tmdbId": i["tmdb_id"], "kind": i["type"],
                   "title": i["title"], "score": round(m.score(i), 6)})
scored.sort(key=lambda r: (-r["score"], r["tmdbId"]))

print(json.dumps({
    "source": SRC,
    "ratedCount": len(ratings),
    "mean": round(m.mean, 6),
    "featureCount": len(m.affinity),
    "top50": scored[:50],
    "bottom20": scored[-20:],
    "keywords": [[v, round(a, 6), m.count[(k, v)]]
                 # ties are common (four keywords share 0.422628); break them by
                 # name so the reference is stable and the port can match it
                 for (k, v), a in sorted(m.affinity.items(), key=lambda kv: (-kv[1], kv[0][1]))
                 if k == "keyword" and m.count[(k, v)] >= 4][:15],
}, ensure_ascii=False))
