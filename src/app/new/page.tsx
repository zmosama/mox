import { NewReleases } from "@/components/NewReleases";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { datedFeed, newTimeline } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewPage() {
  const user = await currentUser();
  const id = user?.id ?? null;
  const today = todayISO();

  return (
    <NewReleases
      today={today}
      available={newTimeline(id, today)}
      upcoming={datedFeed("upcoming", id)}
      signedIn={Boolean(user)}
    />
  );
}
