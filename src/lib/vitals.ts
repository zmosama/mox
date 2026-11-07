/**
 * Real-user speed (see WebVitals.tsx): what browsers report, kept a month,
 * and read back as the 75th percentile per page — the figure Google's own
 * Core Web Vitals use, so one slow phone does not set the number and neither
 * does one fast desktop.
 */
import { lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

/* The site's own pages (WebVitals.tsx turns ids into [id]): a made-up path is
   refused, so the report stays the size of the site. */
const ROUTES = /^\/(|news|new|list|friends|universes|studios|studios\/[\w-]+|f1|f1\/(driver|team)\/[\w-]+|mox|admin|admin\/\w+|privacy|terms|u\/\[name\]|title\/(movie|tv)\/\[id\])$/;

/** Most rows kept, whatever happens: a month of a busy site is far fewer. */
const MAX_ROWS = 200_000;

export const VitalInput = z.object({
  name: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
  value: z.number().finite().min(0).max(120_000),
  rating: z.enum(["good", "needs-improvement", "poor"]).nullable(),
  path: z.string().max(80).regex(ROUTES),
});

const KEEP_DAYS = 30;
let lastSweep = 0;

export function recordVital(v: z.infer<typeof VitalInput>) {
  db.insert(schema.vitals).values(v).run();
  if (Date.now() - lastSweep > 3_600_000) {
    lastSweep = Date.now();
    db.delete(schema.vitals).where(lt(schema.vitals.at, Math.floor(Date.now() / 1000) - KEEP_DAYS * 86400)).run();
    db.run(sql`delete from vitals where id <= (select max(id) from vitals) - ${MAX_ROWS}`);
  }
}

export type VitalRow = { path: string; name: string; p75: number; n: number; good: number };

/** p75 of each metric on each page over the last `days`, most visited pages first. */
export function vitalsSummary(days = 7): VitalRow[] {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  /* The 75th percentile worked out in SQLite rather than by loading every row:
     the row at position min(n, floor(n × 0.75) + 1) of each page's sorted values. */
  const out = db.all<VitalRow>(sql`
    with r as (
      select path, name, value, rating,
             row_number() over (partition by path, name order by value) as rn,
             count(*) over (partition by path, name) as n
      from vitals where at > ${since}
    )
    select path, name, n, sum(rating = 'good') as good,
           max(case when rn = min(n, cast(n * 0.75 as integer) + 1) then value end) as p75
    from r group by path, name`);
  const visits = new Map<string, number>();
  for (const r of out) if (r.name === "TTFB") visits.set(r.path, r.n);
  return out.sort((a, b) => (visits.get(b.path) ?? 0) - (visits.get(a.path) ?? 0) || a.path.localeCompare(b.path) || a.name.localeCompare(b.name));
}
