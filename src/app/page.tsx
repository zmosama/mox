import { Home } from "@/components/Home";
import { avatarUrl, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { calendar, comingSoon, feed, forYou, newOnServices, withReasons } from "@/lib/queries";
import { withBackdrops } from "@/lib/catalog";
import { newFromPeople, within } from "@/lib/people";
import { hasPickedServices } from "@/lib/services";
import { agedEpisodes, agedTitles, ageFilter } from "@/lib/age-filter";

/** Reads the database on every request; nothing here is worth caching. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser();
  const id = user?.id ?? null;
  const today = todayISO();
  const aged = ageFilter(id);

  return (
    <Home
      today={today}
      user={user ? { name: user.displayName ?? user.username, avatar: avatarUrl(user) } : null}
      forYou={id ? await aged(forYou(id, today)) : []}
      episodes={await agedEpisodes(aged, calendar(id, 14))}
      trending={withBackdrops(await aged(withReasons(id, feed("trending", id, 24))))}
      fresh={withBackdrops(await aged(newOnServices(id, today)))}
      coming={withBackdrops(await aged(comingSoon(id, today)))}
      fromPeople={id ? (await agedTitles(aged, await within(2500, newFromPeople(id, today), []))).map((n) => ({ ...n, title: withBackdrops([n.title])[0] })) : []}
      needsServices={Boolean(user) && !hasPickedServices(user!.id)}
    />
  );
}
