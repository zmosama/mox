import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, SESSION_COOKIE } from "@/lib/auth";
import { changePassword } from "@/lib/users";
import { takeRequest } from "@/lib/rate-limit";

const Body = z.object({ current: z.string().max(256).optional(), next: z.string().min(1).max(256) });

/** Change (or, for a Google-made account, set) your password. Other sessions end. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "New password required" }, { status: 400 });

  const limited = takeRequest(`account:${user.id}`, 10, 15 * 60_000);
  if (!limited.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });

  const keep = (await cookies()).get(SESSION_COOKIE)?.value;
  const done = await changePassword(user.id, parsed.data.current, parsed.data.next, keep);
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
