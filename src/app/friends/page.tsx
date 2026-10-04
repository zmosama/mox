import { FriendsFeed } from "@/components/FriendsFeed";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Friends · mox" };

/** What your friends rated lately, and each friend's own list. */
export default async function FriendsPage() {
  const user = await currentUser();
  return <FriendsFeed signedIn={user !== null} />;
}
