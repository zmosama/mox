import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { alerts } from "@/lib/queries";

/** What the app turns into notifications: see `alerts` for the shape. `user`
    lets the phone keep one account's memory of it apart from another's. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ user: user.id, ...alerts(user.id) }, { headers: { "cache-control": "no-store" } });
}
