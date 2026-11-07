import { News } from "@/components/News";
import { currentUser } from "@/lib/auth";
import { newsBoard } from "@/lib/news";
import { readPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export const metadata = { title: "News · mox" };

/** Your updates, stories about what you care for, then the day's film and TV headlines. */
export default async function NewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await currentUser();
  const [board, { tab }] = await Promise.all([
    newsBoard(user?.id ?? null, readPrefs(user?.id ?? null).newsLangs),
    searchParams,
  ]);
  return <News signedIn={user !== null} {...board} initialTab={tab === "sports" ? "sports" : "screen"} />;
}
