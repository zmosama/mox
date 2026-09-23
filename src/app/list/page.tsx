import { MyList } from "@/components/MyList";
import { currentUser } from "@/lib/auth";
import { library } from "@/lib/queries";
import { followedPeople, peopleYouLove } from "@/lib/people";

export const dynamic = "force-dynamic";

/** Shows and people you follow, your watchlist, and the people you keep rating well. */
export default async function ListPage() {
  const user = await currentUser();
  if (!user) return <MyList signedIn={false} following={[]} watchlist={[]} people={[]} loved={[]} />;
  return (
    <MyList
      signedIn
      {...library(user.id)}
      people={followedPeople(user.id)}
      loved={await peopleYouLove(user.id)}
    />
  );
}
