import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { publicKey, subscribe, unsubscribe } from "@/lib/push";

const Subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** The key a browser subscribes with. */
export async function GET() {
  return NextResponse.json({ publicKey: publicKey() }, { headers: { "cache-control": "no-store" } });
}

/** This browser, on this account, wants notifications. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Subscription.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  subscribe(user.id, parsed.data);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

/** This browser no longer does. */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) unsubscribe(user.id, body.endpoint);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
