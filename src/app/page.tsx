import { Home } from "@/components/Home";
import { avatarUrl, currentUser } from "@/lib/auth";
import { APP_TIME_ZONE, todayISO } from "@/lib/dates";
import { calendar, feed, forYou, newInStore, withReasons } from "@/lib/queries";
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
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: APP_TIME_ZONE }).format(new Date()),
  );

  return (
    <Home
      today={today}
      hour={hour}
      user={user ? { name: user.displayName ?? user.username, avatar: avatarUrl(user) } : null}
      forYou={id ? await aged(forYou(id, today)) : []}
      episodes={await agedEpisodes(aged, calendar(id, 14))}
      trending={await aged(withReasons(id, feed("trending", id, 24)))}
      fromPeople={id ? await agedTitles(aged, await within(2500, newFromPeople(id, today), [])) : []}
      inStore={await aged(newInStore(id, today))}
      needsServices={Boolean(user) && !hasPickedServices(user!.id)}
    />
  );
}
