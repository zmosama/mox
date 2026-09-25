import { NextResponse } from "next/server";
import { avatarUrl, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { calendar, feed, forYou, newInStore, withReasons } from "@/lib/queries";
import { newFromPeople, within } from "@/lib/people";
import { agedEpisodes, agedTitles, ageFilter } from "@/lib/age-filter";

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
  const aged = ageFilter(id);

  return NextResponse.json(
    {
      today,
      user: user
        ? { id: user.id, username: user.username, displayName: user.displayName, avatar: avatarUrl(user) }
        : null,
      forYou: id ? await aged(forYou(id, today)) : [],
      calendar: await agedEpisodes(aged, calendar(id, 14)),
      trending: await aged(withReasons(id, feed("trending", id, 24))),
      fromPeople: id ? await agedTitles(aged, await within(2500, newFromPeople(id, today), [])) : [],
      inStore: await aged(newInStore(id, today)),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
