import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";

const Body = z.object({
  tmdbId: z.number().int().positive(),
  season: z.number().int().min(0),
  episode: z.number().int().min(0),
  watched: z.boolean(),
});

/** Tick or untick one episode. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { tmdbId, season, episode, watched } = parsed.data;
  const t = schema.watchedEpisodes;

  if (watched) {
    db.insert(t).values({ userId: user.id, tmdbId, season, episode }).onConflictDoNothing().run();
  } else {
    db.delete(t)
      .where(
        and(
          eq(t.userId, user.id),
          eq(t.tmdbId, tmdbId),
          eq(t.season, season),
          eq(t.episode, episode),
        ),
      )
      .run();
  }

  return NextResponse.json({ ok: true, watched }, { headers: { "cache-control": "no-store" } });
}
