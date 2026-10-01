import { NextResponse } from "next/server";
import { z } from "zod";
import { clearedCookie, currentUser, requestUsesHttps } from "@/lib/auth";
import { accountOf, deleteOwnAccount } from "@/lib/users";
import { takeRequest } from "@/lib/rate-limit";

/** Your account as the settings screen shows it. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ account: accountOf(user.id) }, { headers: { "cache-control": "no-store" } });
}

const Delete = z.object({ password: z.string().max(256).optional() });

/** Delete your account and everything in it. Asks for the password, if it has one. */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Delete.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const limited = takeRequest(`account:${user.id}`, 10, 15 * 60_000);
  if (!limited.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });

  const done = await deleteOwnAccount(user.id, parsed.data.password);
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearedCookie(requestUsesHttps(req)));
  return res;
}
