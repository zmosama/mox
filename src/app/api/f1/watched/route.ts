import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { setWatched } from "@/lib/f1";

const Body = z.object({
  season: z.number().int().min(1950).max(2100),
  round: z.number().int().min(1).max(40),
  watched: z.boolean(),
});

/** "I've watched it": lifts the spoiler shield from one round. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  setWatched(user.id, parsed.data.season, parsed.data.round, parsed.data.watched);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
