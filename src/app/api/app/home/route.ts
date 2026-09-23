import { NextResponse } from "next/server";
import { avatarUrl, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { calendar, feed, forYou, newInStore, withReasons } from "@/lib/queries";
import { newFromPeople, within } from "@/lib/people";

/**
 * Everything the iPhone app's home screen draws, in one round trip.
 *
 * The same reads the Board page makes, plus `forYou`: the app is opened when
 * you are looking for something to watch, so the unwatched episodes that just
 * landed lead.
 */
export async function GET() {
  const user = await currentUser();
  const id = user?.id ?? null;
  const today = todayISO();

  return NextResponse.json(
    {
      today,
      user: user
        ? { id: user.id, username: user.username, displayName: user.displayName, avatar: avatarUrl(user) }
        : null,
      forYou: id ? forYou(id, today) : [],
      calendar: calendar(id, 14),
      trending: withReasons(id, feed("trending", id, 24)),
      fromPeople: id ? await within(2500, newFromPeople(id, today), []) : [],
      inStore: newInStore(id, today),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
