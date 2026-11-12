import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { stockShow } from "@/lib/stock-show";

const Body = z.object({
  tmdbId: z.number().int().positive(),
  following: z.boolean(),
});

/**
 * Following is its own thing, not a verdict: "I loved this film in 2015" and
 * "I watch this show weekly" are different questions, and folding them together
 * is what filled the calendar with shows nobody watches.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { tmdbId, following } = parsed.data;

  if (following) {
    db.insert(schema.follows).values({ userId: user.id, tmdbId }).onConflictDoNothing().run();
    /* A show the calendar does not carry yet — one on no service listed here —
       goes on it now rather than after tonight's run, so Airing shows it the
       moment it is followed. Bounded: past a few seconds the follow is answered
       anyway and the work finishes behind it, and if it fails the nightly job
       still picks the show up. */
    const stocked = stockShow(tmdbId).catch((e) => {
      console.error(`follow: could not stock ${tmdbId}:`, (e as Error).message);
      return 0;
    });
    await Promise.race([stocked, new Promise((r) => setTimeout(r, 6000))]);
  } else {
    db.delete(schema.follows)
      .where(and(eq(schema.follows.userId, user.id), eq(schema.follows.tmdbId, tmdbId)))
      .run();
  }

  return NextResponse.json({ ok: true, following }, { headers: { "cache-control": "no-store" } });
}
