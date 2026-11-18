import { ageFilter } from "@/lib/age-filter";
import { searchCatalog, searchPeople, withBackdrops } from "@/lib/catalog";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { availabilityFor, cardsFor } from "@/lib/queries";
import { matchQuality, rankResults } from "@/lib/search-rank";
import { profileUrl } from "@/lib/people";
import { PAGE, pageParam } from "@/lib/paging";

/**
 * Search, ten titles at a time: `?q=…&page=n`, and `next` names the page to
 * ask for when the list is scrolled to its end.
 *
 * MOX's own catalogue answers, and only it: IMDb's index and the catalogue's
 * titles and people, all on this server. TMDB is not asked for anything here —
 * not for matches, not for a title's certificate — so its allowance is kept
 * for what only it can answer. A title the catalogue has never met is not
 * found until a nightly job brings it in.
 *
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

  const found = await searchCatalog(query, LOCAL_LIMIT);
  // What you can watch tonight comes before what you cannot, at the same match.
  const avail = availabilityFor(found.map((f) => f.tmdbId), user?.id ?? null);
  const local = rankResults(found.map((f) => ({ ...f, mine: avail.has(`${f.tmdbId}:${f.kind}`) })), query)
    .map(({ tmdbId, kind, title, year, poster, rating }) => ({ tmdbId, kind, title, year, poster, rating }));
  const items = local.slice((page - 1) * PAGE, page * PAGE);
  const next = local.length > page * PAGE ? page + 1 : null;
  // A name that answers what was typed, not one that merely holds its
  // letters: "the love h" found Gunther Love.
  const people = page !== 1 ? [] : searchPeople(query).filter((p) => matchQuality(p.name, query) >= 2).map((p) => ({
    id: p.id,
    name: p.name,
    profile: profileUrl(p.profilePath),
    department: p.department,
    knownFor: [],
  }));
  // A title whose certificate was never looked up is left out for a viewer
  // who filters by age, rather than asked about now: the nightly sweep asks.
  const results = await apply(cardsFor(items, user?.id ?? null), { unchecked: "hide" });
  return NextResponse.json(
    { results: withBackdrops(results), people, next, source: "mox" },
    { headers: { "cache-control": "no-store" } },
  );
}
