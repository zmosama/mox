import { F1 } from "@/components/F1";
import { currentUser } from "@/lib/auth";
import { f1Board } from "@/lib/f1";
import { readPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export const metadata = { title: "F1 · mox" };

/** The next race weekend in Cairo time, results behind the spoiler shield, standings, the season. */
export default async function F1Page() {
  const user = await currentUser();
  // Signed out there is no "I've watched it" to press, so nothing is shielded.
  const shield = user ? readPrefs(user.id).f1Shield : false;
  const data = await f1Board(user?.id ?? null, shield).catch(() => null);
  if (!data) {
    return (
      <>
        <h1 className="mb-7 text-[28px] font-bold tracking-tight">F1</h1>
        <p className="text-[14px] text-ink-dim">The F1 calendar can&apos;t be reached right now. Try again in a minute.</p>
      </>
    );
  }
  return <F1 data={data} signedIn={user !== null} />;
}
