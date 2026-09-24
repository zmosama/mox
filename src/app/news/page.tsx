import { News } from "@/components/News";
import { currentUser } from "@/lib/auth";
import { newsBoard } from "@/lib/news";
import { readPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export const metadata = { title: "News · mox" };

/** Your updates, stories about what you care for, then the day's film and TV headlines. */
export default async function NewsPage() {
  const user = await currentUser();
  const board = await newsBoard(user?.id ?? null, readPrefs(user?.id ?? null).newsLangs);
  return <News signedIn={user !== null} {...board} />;
}
