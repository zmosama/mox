import { ageFilter } from "@/lib/age-filter";
import { rememberPeople, rememberTitles, searchCatalog, searchPeople, withBackdrops } from "@/lib/catalog";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { cardsFor } from "@/lib/queries";
import { tmdb } from "@/lib/tmdb";
import { profileUrl } from "@/lib/people";
import { PAGE, pageParam, slice, tmdbPage, toHit, type TmdbListItem } from "@/lib/paging";
import type { MediaKind } from "@/db/schema";

type MultiResult = {
  total_pages?: number;
  results?: (TmdbListItem & {
    profile_path?: string | null;
    known_for_department?: string;
    known_for?: { title?: string; name?: string }[];
  })[];
};

/**
 * Search, ten titles at a time: `?q=…&page=n`, and `next` names the page to
 * ask for when the list is scrolled to its end.
 *
 * MOX's own catalogue answers first. TMDB is asked only when it cannot answer
 * in full — a name rather than a title, or matches not mapped to TMDB yet.
 *
 * TMDB's order is the order, so pages never repeat or skip a title; the
 * catalogue only adds where it streams and what you and your friends thought.
 * People come with the first page only.
 */
/** Twenty pages of ten: past that, nobody is looking for one title. */
const LOCAL_LIMIT = 200;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const page = pageParam(params.get("page"));
  if (query.length < 2) return NextResponse.json({ results: [], people: [], next: null });

  const user = await currentUser();
  const apply = ageFilter(user?.id ?? null);

  const local = await searchCatalog(query, LOCAL_LIMIT);
  if (local?.length) {
    const items = local.slice((page - 1) * PAGE, page * PAGE);
    const next = local.length > page * PAGE ? page + 1 : null;
    const people = page !== 1 ? [] : searchPeople(query).map((p) => ({
      id: p.id,
      name: p.name,
      profile: profileUrl(p.profilePath),
      department: p.department,
      knownFor: [],
    }));
    const results = await apply(cardsFor(items, user?.id ?? null), { lookUp: true });
    return NextResponse.json(
      { results: withBackdrops(results), people, next, source: "mox" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  let remote: MultiResult = {};
  try {
    remote = await tmdb<MultiResult>("/search/multi", {
      query,
      include_adult: "false",
      page: tmdbPage(page).tmdbPage,
    });
  } catch {
    return NextResponse.json({ results: [], people: [], next: null }, { status: 502 });
  }

  // Everything TMDB answered is kept: the catalogue grows with every search.
  rememberTitles(
    (remote.results ?? [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => ({ item: r, kind: r.media_type as MediaKind })),
  );
  rememberPeople((remote.results ?? []).filter((r) => r.media_type === "person"));

  const titles = (remote.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => toHit(r, r.media_type as MediaKind));
  const { items, next } = slice(titles, page, remote.total_pages ?? 1);

  /* People too: an actor or director is as good a way into a film as its
     title. Only ones with a face and some known work — TMDB also has every
     extra who ever had a line. */
  const people = page !== 1 ? [] : (remote.results ?? [])
    .filter((r) => r.media_type === "person" && r.profile_path && r.known_for?.length)
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      name: r.name ?? "",
      profile: profileUrl(r.profile_path),
      department: r.known_for_department ?? null,
      knownFor: (r.known_for ?? []).map((k) => k.title ?? k.name ?? "").filter(Boolean).slice(0, 3),
    }));

  /* Straight from TMDB, so many results were never stored: their certificates
     are looked up here — ten at most — rather than letting an unchecked 18+
     through. */
  const results = await apply(cardsFor(items, user?.id ?? null), { lookUp: true });

  return NextResponse.json(
    { results: withBackdrops(results), people, next },
    { headers: { "cache-control": "no-store" } },
  );
}
