import { NextResponse } from "next/server";
import { withBackdrops } from "@/lib/catalog";
import { avatarUrl, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { calendar, feed, forYou, withReasons } from "@/lib/queries";
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
      forYou: id ? withBackdrops(await aged(forYou(id, today))) : [],
      calendar: await agedEpisodes(aged, calendar(id, 14)),
      trending: withBackdrops(await aged(withReasons(id, feed("trending", id, 24)))),
      fromPeople: id ? await agedTitles(aged, await within(2500, newFromPeople(id, today), [])) : [],
      /* The store shelf is gone — rent and buy now show on the title itself.
         Kept as an empty list because the shipped iPhone app decodes it as
         required, and an empty rail simply isn't drawn. */
      inStore: [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
