import { notFound } from "next/navigation";
import { StudioWorks } from "@/components/StudioWorks";
import { currentUser } from "@/lib/auth";
import { readPrefs } from "@/lib/prefs";
import { kindsOf, logoUrl, studioBySlug } from "@/lib/studios";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const studio = studioBySlug((await params).slug);
  return { title: studio ? `${studio.name} · mox` : "mox" };
}

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const studio = studioBySlug((await params).slug);
  if (!studio) notFound();
  const user = await currentUser();
  return (
    <StudioWorks
      slug={studio.slug}
      name={studio.name}
      logo={logoUrl(studio.logo)}
      kinds={kindsOf(studio)}
      signedIn={user !== null}
      following={user ? readPrefs(user.id).studios.includes(studio.slug) : false}
    />
  );
}
