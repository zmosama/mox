import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { changeEmail } from "@/lib/users";
import { takeRequest } from "@/lib/rate-limit";

const Body = z.object({ email: z.string().min(1).max(254), password: z.string().max(256).optional() });

/** Change your email. Asks for the password, if the account has one. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const limited = takeRequest(`account:${user.id}`, 10, 15 * 60_000);
  if (!limited.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });

  const done = await changeEmail(user.id, parsed.data.email, parsed.data.password);
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true, email: done.value.email }, { headers: { "cache-control": "no-store" } });
}
