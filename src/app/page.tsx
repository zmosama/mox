import { Home } from "@/components/Home";
import { avatarUrl, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { calendar, comingSoon, feed, forYou, newOnServices, picksFor, withReasons, mineFirst } from "@/lib/queries";
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
      trending={withBackdrops(await aged(withReasons(id, mineFirst(feed("trending", id, 40, false)))))}
      fresh={withBackdrops(await aged(newOnServices(id, today)))}
      coming={withBackdrops(await aged(comingSoon(id, today)))}
      picks={id ? withBackdrops(await aged(picksFor(id).slice(0, 20))) : []}
      fromPeople={id ? (await agedTitles(aged, await within(2500, newFromPeople(id, today), []))).map((n) => ({ ...n, title: withBackdrops([n.title])[0] })) : []}
      needsServices={Boolean(user) && !hasPickedServices(user!.id)}
    />
  );
}
