import { Board } from "@/components/Board";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { calendar, feed } from "@/lib/queries";
import { hasPickedServices } from "@/lib/services";

/** Reads the database on every request; nothing here is worth caching. */
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await currentUser();
  const today = todayISO();

  return (
    <Board
      today={today}
      episodes={calendar(user?.id ?? null, 14)}
      trending={feed("trending", user?.id ?? null, 24)}
      signedIn={Boolean(user)}
      needsServices={Boolean(user) && !hasPickedServices(user!.id)}
    />
  );
}
