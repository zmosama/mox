import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { readPrefs } from "@/lib/prefs";
import { kindsOf, logoUrl, studiosFor } from "@/lib/studios";

/** The studios: the ones you follow first, then the rest, most important first. */
export async function GET() {
  const user = await currentUser();
  return NextResponse.json(
    {
      studios: studiosFor(readPrefs(user?.id ?? null).studios).map((s) => ({
        slug: s.slug,
        name: s.name,
        logo: logoUrl(s.logo),
        kinds: kindsOf(s),
        following: s.following,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
