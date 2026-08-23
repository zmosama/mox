import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { MEDIA_KINDS, VERDICTS } from "@/db/schema";

const Body = z.object({
  tmdbId: z.number().int().positive(),
  kind: z.enum(MEDIA_KINDS),
  /** null clears the verdict rather than storing an "undecided" state. */
  verdict: z.enum(VERDICTS).nullable(),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { tmdbId, kind, verdict } = parsed.data;

  const where = and(
    eq(schema.verdicts.userId, user.id),
    eq(schema.verdicts.tmdbId, tmdbId),
    eq(schema.verdicts.kind, kind),
  );

  if (verdict === null) {
    db.delete(schema.verdicts).where(where).run();
  } else {
    db.insert(schema.verdicts)
      .values({ userId: user.id, tmdbId, kind, verdict })
      .onConflictDoUpdate({
        target: [schema.verdicts.userId, schema.verdicts.tmdbId, schema.verdicts.kind],
        set: { verdict, updatedAt: Math.floor(Date.now() / 1000) },
      })
      .run();
  }

  return NextResponse.json({ ok: true, verdict }, { headers: { "cache-control": "no-store" } });
}
