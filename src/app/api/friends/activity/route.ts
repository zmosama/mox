import { NextResponse } from "next/server";
import { ageFilter } from "@/lib/age-filter";
import { currentUser } from "@/lib/auth";
import { friendActivity, friendsOf } from "@/lib/friends";
import { pageParam, toHit, type TmdbListItem } from "@/lib/paging";
import { cardsFor, titlesByIds, type Hit } from "@/lib/queries";
import { posterPath } from "@/lib/tmdb";
import { catalogued, titleDetail } from "@/lib/catalog";
import { VERDICTS, type MediaKind, type Verdict } from "@/db/schema";

const key = (tmdbId: number, kind: MediaKind) => `${tmdbId}:${kind}`;

/**
 * What your friends rated lately, newest first: `?friend=<id>` for one of
 * them, `?verdict=love` for one kind, `?page=n` for the next twenty.
 *
 * A rating is stored by id alone, and much of what people rate was never
 * imported — those titles come from MOX's catalogue, and from TMDB (then kept)
 * only the first time.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ friends: [], items: [], next: null });

  const q = new URL(req.url).searchParams;
  const friendId = q.get("friend") ? Number(q.get("friend")) : undefined;
  const verdict = (VERDICTS as readonly string[]).includes(q.get("verdict") ?? "") ? (q.get("verdict") as Verdict) : undefined;
  const page = pageParam(q.get("page"));

  const { rows, more } = friendActivity(user.id, { friendId, verdict, page });

  const stored = titlesByIds(rows);
  const known = catalogued(rows);
  const hits = new Map<string, Hit>();
  await Promise.all(
    rows.map(async (r) => {
      const k = key(r.tmdbId, r.kind);
      if (hits.has(k)) return;
      const t = stored.get(k);
      if (t) {
        hits.set(k, { tmdbId: t.tmdbId, kind: t.kind, title: t.title, year: t.year, poster: t.poster, rating: t.rating });
        return;
      }
      const c = known.get(k);
      if (c?.title) {
        hits.set(k, { tmdbId: c.tmdbId, kind: c.kind, title: c.title, year: c.year, poster: posterPath(c.posterPath), rating: c.rating ? Math.round(c.rating * 10) / 10 : null });
        return;
      }
      try {
        hits.set(k, toHit(await titleDetail<TmdbListItem>(r.kind, r.tmdbId), r.kind));
      } catch {
        // Gone from TMDB: the row is left out rather than shown blank.
      }
    }),
  );

  const unique = [...hits.values()];
  const cards = new Map(
    (await ageFilter(user.id)(cardsFor(unique, user.id))).map((c) => [key(c.tmdbId, c.kind), c]),
  );
  const items = rows.flatMap((r) => {
    const card = cards.get(key(r.tmdbId, r.kind));
    return card ? [{ friend: r.friend, at: r.at, title: card }] : [];
  });

  return NextResponse.json(
    { friends: page === 1 ? friendsOf(user.id) : undefined, items, next: more ? page + 1 : null },
    { headers: { "cache-control": "no-store" } },
  );
}
