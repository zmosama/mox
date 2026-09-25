import { NewReleases } from "@/components/NewReleases";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { datedFeed, newTimeline } from "@/lib/queries";
import { ageFilter } from "@/lib/age-filter";

export const dynamic = "force-dynamic";

export default async function NewPage() {
  const user = await currentUser();
  const id = user?.id ?? null;
  const today = todayISO();
  const aged = ageFilter(id);

  return (
    <NewReleases
      today={today}
      available={await aged(newTimeline(id, today))}
      upcoming={await aged(datedFeed("upcoming", id))}
      signedIn={Boolean(user)}
    />
  );
}
