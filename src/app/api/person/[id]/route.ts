import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { personDetail } from "@/lib/people";
import { ageFilter } from "@/lib/age-filter";
import { clientAddress, takeRequest } from "@/lib/rate-limit";

/** An actor or director, with everything they made and where it streams. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad person" }, { status: 400 });

  /* A person page can cost TMDB forty requests, and it is open to anyone:
     without a ceiling, walking through ids would spend the whole API key. */
  const limited = takeRequest(`person:${clientAddress(req)}`, 60, 10 * 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many people at once. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  const user = await currentUser();
  try {
    const person = await personDetail(id, user?.id ?? null);
    const credits = await ageFilter(user?.id ?? null)(person.credits);
    return NextResponse.json({ ...person, credits }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
