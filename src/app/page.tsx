import { Home } from "@/components/Home";
import { avatarUrl, currentUser } from "@/lib/auth";
import { APP_TIME_ZONE, todayISO } from "@/lib/dates";
import { calendar, feed, forYou, newInStore, withReasons } from "@/lib/queries";
import { newFromPeople, within } from "@/lib/people";
import { hasPickedServices } from "@/lib/services";

/** Reads the database on every request; nothing here is worth caching. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser();
  const id = user?.id ?? null;
  const today = todayISO();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: APP_TIME_ZONE }).format(new Date()),
  );

  return (
    <Home
      today={today}
      hour={hour}
      user={user ? { name: user.displayName ?? user.username, avatar: avatarUrl(user) } : null}
      forYou={id ? forYou(id, today) : []}
      episodes={calendar(id, 14)}
      trending={withReasons(id, feed("trending", id, 24))}
      fromPeople={id ? await within(2500, newFromPeople(id, today), []) : []}
      inStore={newInStore(id, today)}
      needsServices={Boolean(user) && !hasPickedServices(user!.id)}
    />
  );
}
