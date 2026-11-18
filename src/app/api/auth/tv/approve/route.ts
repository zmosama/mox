import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { takeRequest } from "@/lib/rate-limit";
import { approveTvLogin, normalizeCode } from "@/lib/tv-login";

const Body = z.object({ code: z.string().min(1).max(32) });

/** A signed-in person approves the TV showing this code. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  // Guessing a code that is on somebody else's screen would only sign that
  // TV into the guesser's own account; still, nobody needs many tries.
  const limit = takeRequest(`tv-approve:user:${user.id}`, 20, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many tries. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  const code = normalizeCode(parsed.success ? parsed.data.code : null);
  if (!code || !approveTvLogin(code, user.id)) {
    return NextResponse.json(
      { error: "No Apple TV is showing that code. It may have expired — check the TV." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
