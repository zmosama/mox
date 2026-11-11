import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { addFriend, addFriendById, friendsOf, removeFriend } from "@/lib/friends";
import { takeRequest } from "@/lib/rate-limit";

const noStore = { headers: { "cache-control": "no-store" } };

/** Your friends. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ friends: [] }, noStore);
  return NextResponse.json({ friends: friendsOf(user.id) }, noStore);
}

/** A suggestion tapped (`id`), or a username or email typed in full (`who`). */
const Add = z.union([z.object({ id: z.number().int().positive() }), z.object({ who: z.string().min(1).max(200) })]);

/** Add a friend by username or email. Both of you see each other's ratings from then on. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  // Adding by email says whether an address has an account here; nobody adds twenty friends an hour.
  const limited = takeRequest(`friends:add:${user.id}`, 20, 60 * 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "That's a lot of people at once. Try again later." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  const parsed = Add.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type their username or email." }, { status: 400 });
  const result = "id" in parsed.data ? addFriendById(user.id, parsed.data.id) : addFriend(user.id, parsed.data.who);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ friend: result.value, friends: friendsOf(user.id) }, noStore);
}

const Remove = z.object({ id: z.number().int().positive() });

/** Unfriend, for both sides. */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const parsed = Remove.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  removeFriend(user.id, parsed.data.id);
  return NextResponse.json({ friends: friendsOf(user.id) }, noStore);
}
