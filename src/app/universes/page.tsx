import { Universes } from "@/components/Universes";
import { currentUser } from "@/lib/auth";
import { universeList, universeTitles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function UniversesPage() {
  const user = await currentUser();
  const id = user?.id ?? null;

  const universes = universeList().map((u) => ({
    slug: u.slug,
    name: u.name,
    titles: universeTitles(u.slug, id),
  }));

  return <Universes universes={universes} signedIn={Boolean(user)} />;
}
