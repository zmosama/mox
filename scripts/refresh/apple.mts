/**
 * Films somebody is waiting for, looked up on Apple's own store.
 *
 * Only the ones with nowhere to watch them: on no service, and not on the
 * store's shelf as TMDB reports it. Those are the films TMDB would be late
 * about — and a watchlist is short, so this is a dozen questions a night, one
 * at a time, not a sweep of anybody's catalogue (src/lib/apple-page.ts).
 */
import { sql } from "drizzle-orm";
import { db } from "./shared.mjs";
import { findApplePage, saveApplePage } from "../../src/lib/apple-page";

/** A page already found is looked at again this often, in case Apple drops it. */
const RECHECK = 7 * 86_400;
const PAUSE_MS = 700;

export async function refreshApplePages(limit = 60): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const rows = db.all<{ tmdb_id: number; title: string }>(sql`
    select distinct v.tmdb_id, coalesce(t.title, c.title) as title
    from verdicts v
    left join titles t on t.tmdb_id = v.tmdb_id and t.kind = 'movie'
    left join catalog_titles c on c.tmdb_id = v.tmdb_id and c.kind = 'movie'
    left join apple_pages p on p.tmdb_id = v.tmdb_id and p.kind = 'movie'
    where v.kind = 'movie' and v.verdict = 'watchlist'
      and coalesce(t.title, c.title) is not null
      and not exists (select 1 from availability a where a.tmdb_id = v.tmdb_id and a.kind = 'movie')
      and not exists (select 1 from store_items s where s.tmdb_id = v.tmdb_id and s.kind = 'movie')
      and (p.url is null or p.checked_at < ${now - RECHECK})
    order by p.checked_at asc nulls first
    limit ${limit}`);
  if (!rows.length) return "no film waiting on a store";

  let found = 0;
  let unknown = 0;
  for (const row of rows) {
    const answer = await findApplePage(row.tmdb_id, row.title);
    if (answer === "unknown") unknown++;
    else {
      saveApplePage(row.tmdb_id, answer.url);
      if (answer.url) found++;
    }
    await new Promise((done) => setTimeout(done, PAUSE_MS));
  }
  return `${rows.length} films asked, ${found} listed on Apple's store${unknown ? `, ${unknown} unanswered` : ""}`;
}
