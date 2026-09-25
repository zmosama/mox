import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { sendTo } from "@/lib/push";
import { clientAddress, takeRequest } from "@/lib/rate-limit";

/** "Send a test": proves the whole path end to end, to every browser of this account. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!takeRequest(`push-test:${clientAddress(req)}`, 5, 10 * 60_000).allowed) {
    return NextResponse.json({ error: "Try again in a few minutes" }, { status: 429 });
  }
  const delivered = await sendTo(user.id, {
    title: "MOX",
    body: "Notifications are on. New episodes, arrivals and races will show up here.",
    url: "/",
    tag: "test",
  });
  return NextResponse.json({ delivered }, { headers: { "cache-control": "no-store" } });
}
