import { NextResponse } from "next/server";
import { clientAddress, takeRequest } from "@/lib/rate-limit";
import { startTvLogin } from "@/lib/tv-login";

/** An Apple TV asks for a code to show. See src/lib/tv-login.ts. */
export async function POST(req: Request) {
  const limit = takeRequest(`tv-start:ip:${clientAddress(req)}`, 20, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many codes asked for. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }
  return NextResponse.json(startTvLogin(), { headers: { "cache-control": "no-store" } });
}
