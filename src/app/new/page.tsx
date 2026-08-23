import { NewReleases } from "@/components/NewReleases";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { datedFeed } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewPage() {
  const user = await currentUser();
  const id = user?.id ?? null;

  return (
    <NewReleases
      today={todayISO()}
      available={datedFeed("new", id)}
      upcoming={datedFeed("upcoming", id)}
      signedIn={Boolean(user)}
    />
  );
}
