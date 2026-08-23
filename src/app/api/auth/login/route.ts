import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, requestUsesHttps, sessionCookie, signIn } from "@/lib/auth";
import { clientAddress, takeRequest } from "@/lib/rate-limit";

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const username = parsed.data.username.trim().toLowerCase();
  const byAddress = takeRequest(`login:ip:${clientAddress(req)}`, 20, 15 * 60_000);
  const byAccount = takeRequest(`login:user:${username}`, 10, 15 * 60_000);
  if (!byAddress.allowed || !byAccount.allowed) {
    const retryAfter = Math.max(byAddress.retryAfter, byAccount.retryAfter);
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  const user = await signIn(username, parsed.data.password);
  // One message for both cases, so this can't be used to discover usernames.
  if (!user) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }

  const sessionId = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(sessionCookie(sessionId, requestUsesHttps(req)));
  return res;
}
