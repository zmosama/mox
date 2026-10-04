import { NextResponse } from "next/server";
import { ageFilter } from "@/lib/age-filter";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { pageParam, slice, tmdbPage, toHit, type TmdbListItem } from "@/lib/paging";
import { cardsFor } from "@/lib/queries";
import { SORTS, discoverParams, kindsOf, studioBySlug, type StudioSort } from "@/lib/studios";
import { tmdb } from "@/lib/tmdb";
import { MEDIA_KINDS, type MediaKind } from "@/db/schema";

/**
 * One studio's work, ten at a time: `?kind=movie|tv&sort=popular|top|newest&page=n`.
 * `next` names the page that follows, or is null at the end.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const studio = studioBySlug((await params).slug);
  if (!studio) return NextResponse.json({ error: "no such studio" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  const kinds = kindsOf(studio);
  const kind = (MEDIA_KINDS as readonly string[]).includes(q.get("kind") ?? "") && kinds.includes(q.get("kind") as MediaKind)
    ? (q.get("kind") as MediaKind)
    : kinds[0];
  const sort: StudioSort = (SORTS as readonly string[]).includes(q.get("sort") ?? "") ? (q.get("sort") as StudioSort) : "popular";
  const page = pageParam(q.get("page"));

  const discover = discoverParams(studio, kind, sort, todayISO())!;
  let remote: { total_pages?: number; results?: TmdbListItem[] } = {};
  try {
    remote = await tmdb(`/discover/${kind}`, { ...discover, page: tmdbPage(page).tmdbPage });
  } catch {
    return NextResponse.json({ results: [], next: null }, { status: 502 });
  }

  const { items, next } = slice((remote.results ?? []).map((r) => toHit(r, kind)), page, remote.total_pages ?? 1);
  const user = await currentUser();
  const results = await ageFilter(user?.id ?? null)(cardsFor(items, user?.id ?? null), { lookUp: true });

  return NextResponse.json({ kind, sort, results, next }, { headers: { "cache-control": "no-store" } });
}
