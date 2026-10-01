import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, requestUsesHttps, sessionCookie, signIn } from "@/lib/auth";
import { createUser } from "@/lib/users";
import { clientAddress, takeRequest } from "@/lib/rate-limit";

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  displayName: z.string().max(60).optional(),
  email: z.string().max(254).optional(),
});

/**
 * Register, then sign straight in.
 *
 * Note there is no role in the body and none is accepted: `createUser` takes
 * no role argument at all, so this route cannot mint an admin however it is
 * called. Handing out admin is the owner's job, on /admin/users.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const limited = takeRequest(`signup:ip:${clientAddress(req)}`, 8, 60 * 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many accounts created from this address. Try again later." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const created = await createUser(
    parsed.data.username,
    parsed.data.password,
    parsed.data.displayName,
    parsed.data.email,
  );
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const user = await signIn(created.value.username, parsed.data.password);
  if (!user) {
    // The account exists; only the automatic sign-in fell over.
    return NextResponse.json({ ok: true, signedIn: false }, { status: 201 });
  }

  const sessionId = await createSession(user.id);
  const res = NextResponse.json(
    { ok: true, signedIn: true, user },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
  res.cookies.set(sessionCookie(sessionId, requestUsesHttps(req)));
  return res;
}
