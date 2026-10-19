import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { f1Team } from "@/lib/f1";
import { readPrefs } from "@/lib/prefs";

/** One team: who they are, their career, and this season behind the shield. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const shield = user ? readPrefs(user.id).f1Shield : false;
  try {
    const data = await f1Team((await params).id, user?.id ?? null, shield);
    if (!data) return NextResponse.json({ error: "No such team" }, { status: 404 });
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "F1 data could not be reached." }, { status: 502 });
  }
}
