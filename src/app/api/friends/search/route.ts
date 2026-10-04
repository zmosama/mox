import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { findPeople } from "@/lib/friends";

/** Suggestions for the add-a-friend box, from the first letter typed. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ people: [] });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ people: findPeople(user.id, q) }, { headers: { "cache-control": "no-store" } });
}
