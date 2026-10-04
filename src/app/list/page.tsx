import { MyList } from "@/components/MyList";
import { currentUser } from "@/lib/auth";
import { agedLibrary } from "@/lib/age-filter";
import { followedPeople, peopleYouLove, within } from "@/lib/people";

export const dynamic = "force-dynamic";

const SITE = process.env.MOX_PUBLIC_URL ?? "https://mox.mosama.me";

/** Shows and people you follow, your watchlist, and the people you keep rating well. */
export default async function ListPage() {
  const user = await currentUser();
  if (!user) return <MyList signedIn={false} following={[]} watchlist={[]} people={[]} loved={[]} />;
  return (
    <MyList
      signedIn
      shareUrl={`${SITE}/u/${user.username}`}
      {...(await agedLibrary(user.id))}
      people={followedPeople(user.id)}
      loved={await within(2500, peopleYouLove(user.id), [])}
    />
  );
}
