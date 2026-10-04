import { NextResponse } from "next/server";
import { STUDIOS, kindsOf, logoUrl } from "@/lib/studios";

/** The studios, most important first. */
export function GET() {
  return NextResponse.json({
    studios: STUDIOS.map((s) => ({ slug: s.slug, name: s.name, logo: logoUrl(s.logo), kinds: kindsOf(s) })),
  });
}
