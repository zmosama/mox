import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { readPrefs, writePrefs } from "@/lib/prefs";
import { studioBySlug } from "@/lib/studios";

const Body = z.object({ slug: z.string().max(64), following: z.boolean() });

/** Follow or unfollow a studio. A new follow goes to the end of the ones you follow. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !studioBySlug(parsed.data.slug)) {
    return NextResponse.json({ error: "no such studio" }, { status: 400 });
  }
  const { slug, following } = parsed.data;
  const now = readPrefs(user.id).studios.filter((s) => s !== slug);
  const prefs = writePrefs(user.id, { studios: following ? [...now, slug] : now });
  return NextResponse.json({ following, studios: prefs.studios }, { headers: { "cache-control": "no-store" } });
}
