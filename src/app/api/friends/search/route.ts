import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { findPeople } from "@/lib/friends";
import { takeRequest } from "@/lib/rate-limit";

const noStore = { headers: { "cache-control": "no-store" } };

/** Suggestions for the add-a-friend box, from the first letter typed. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ people: [] }, noStore);
  // A request per letter typed is normal; walking the alphabet to list every account is not.
  const limited = takeRequest(`friends:search:${user.id}`, 60, 10 * 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { people: [], error: "Too many searches. Try again in a few minutes." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ people: findPeople(user.id, q) }, noStore);
}
