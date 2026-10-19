import { notFound } from "next/navigation";
import { TeamProfile } from "@/components/F1Profile";
import { currentUser } from "@/lib/auth";
import { f1Team } from "@/lib/f1";
import { readPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${id.replace(/_/g, " ")} · F1 · mox` };
}

/** One team's page: who they are, their career, and this season behind the shield. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const shield = user ? readPrefs(user.id).f1Shield : false;
  const data = await f1Team((await params).id, user?.id ?? null, shield).catch(() => null);
  if (!data) notFound();
  return <TeamProfile t={data} />;
}
