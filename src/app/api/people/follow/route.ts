import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { setFollowingPerson } from "@/lib/people";

const Body = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  /* Only a TMDB image: this is stored and shown back as an <img>, and any other
     address would let a client make the page load whatever it liked. */
  profile: z
    .string()
    .max(500)
    .regex(/^https:\/\/image\.tmdb\.org\/t\/p\/[\w]+\/[\w.-]+$/)
    .nullable(),
  following: z.boolean(),
});

/** Follow or unfollow an actor or director. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { following, ...person } = parsed.data;
  setFollowingPerson(user.id, person, following);
  return NextResponse.json({ ok: true, following }, { headers: { "cache-control": "no-store" } });
}
