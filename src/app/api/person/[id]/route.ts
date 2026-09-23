import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { personDetail } from "@/lib/people";

/** An actor or director, with everything they made and where it streams. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad person" }, { status: 400 });
  const user = await currentUser();
  try {
    return NextResponse.json(await personDetail(id, user?.id ?? null), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
