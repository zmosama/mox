import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { f1Round } from "@/lib/f1";
import { readPrefs } from "@/lib/prefs";

/** One round's sessions, and its results once they may be shown. */
export async function GET(_: Request, { params }: { params: Promise<{ round: string }> }) {
  const round = Number((await params).round);
  if (!Number.isInteger(round) || round < 1 || round > 40) {
    return NextResponse.json({ error: "No such round" }, { status: 404 });
  }
  const user = await currentUser();
  try {
    const data = await f1Round(user?.id ?? null, user ? readPrefs(user.id).f1Shield : false, round);
    if (!data) return NextResponse.json({ error: "No such round" }, { status: 404 });
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The F1 calendar could not be reached." }, { status: 502 });
  }
}
