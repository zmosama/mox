import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, requestUsesHttps, sessionCookie, userById } from "@/lib/auth";
import { claimTvLogin } from "@/lib/tv-login";

const Body = z.object({ secret: z.string().min(20).max(100) });

/**
 * The TV asks whether its code was approved. Once it was, this answer carries
 * the session cookie — the only time it is given out.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "secret required" }, { status: 400 });

  const headers = { "cache-control": "no-store" };
  const claim = claimTvLogin(parsed.data.secret);
  if (claim.state !== "approved") return NextResponse.json({ state: claim.state }, { headers });

  const user = userById(claim.userId);
  if (!user) return NextResponse.json({ state: "expired" }, { headers });

  const res = NextResponse.json({ state: "approved", user }, { headers });
  res.cookies.set(sessionCookie(await createSession(user.id), requestUsesHttps(req)));
  return res;
}
