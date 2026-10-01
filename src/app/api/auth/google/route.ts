import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, requestUsesHttps, sessionCookie, userById } from "@/lib/auth";
import { verifyIdToken } from "@/lib/google";
import { googleAccount } from "@/lib/users";
import { clientAddress, takeRequest } from "@/lib/rate-limit";

const Body = z.object({ idToken: z.string().min(1).max(4096) });

/**
 * Sign in — or sign up — with Google. One button does both: an unknown Google
 * account becomes a new mox account, a known one signs in, and one whose email
 * matches an existing account is linked to it.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "idToken required" }, { status: 400 });

  const limited = takeRequest(`google:ip:${clientAddress(req)}`, 20, 15 * 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const profile = await verifyIdToken(parsed.data.idToken);
  if (!profile) return NextResponse.json({ error: "Google did not confirm that sign-in." }, { status: 401 });

  const account = await googleAccount(profile);
  const user = userById(account.value.id);
  if (!user) return NextResponse.json({ error: "Sign-in failed." }, { status: 500 });

  const sessionId = await createSession(user.id);
  const res = NextResponse.json(
    { ok: true, created: account.value.created, user },
    { headers: { "cache-control": "no-store" } },
  );
  res.cookies.set(sessionCookie(sessionId, requestUsesHttps(req)));
  return res;
}
