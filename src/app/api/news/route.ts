import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { newsBoard } from "@/lib/news";
import { readPrefs } from "@/lib/prefs";

/** The News tab: your updates, stories about what you care for, then the day's headlines. */
export async function GET() {
  const user = await currentUser();
  const prefs = readPrefs(user?.id ?? null);
  return NextResponse.json(await newsBoard(user?.id ?? null, prefs.newsLangs), {
    headers: { "cache-control": "no-store" },
  });
}
