import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { MyList } from "@/components/MyList";
import { currentUser } from "@/lib/auth";
import { agedLibrary } from "@/lib/age-filter";
import { followedPeople } from "@/lib/people";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

function ownerOf(username: string) {
  const u = db
    .select({ id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.username, decodeURIComponent(username).toLowerCase()))
    .get();
  return u ? { id: u.id, name: u.displayName?.trim() || u.username } : null;
}

/** What a shared list shows in WhatsApp or Messages before anyone opens it. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const owner = ownerOf((await params).username);
  if (!owner) return { title: "mox" };
  const { following, watchlist } = await agedLibrary(owner.id);
  const title = `${owner.name}’s list · mox`;
  const description = [
    following.length ? `Follows ${following.length} show${following.length === 1 ? "" : "s"}` : null,
    watchlist.length ? `wants to watch ${watchlist.length}` : null,
  ].filter(Boolean).join(", ") || "What they follow and want to watch.";
  const poster = [...watchlist, ...following].find((c) => c.poster)?.poster;
  return {
    title,
    description,
    openGraph: { title, description, images: poster ? [poster] : [] },
    twitter: { card: "summary", title, description, images: poster ? [poster] : [] },
  };
}

/**
 * Someone's list — the shows they follow, the people they follow and their
 * watchlist — for anyone with the link, with or without an account. Shared
 * from the Share button on My List.
 */
export default async function SharedListPage({ params }: Params) {
  const owner = ownerOf((await params).username);
  if (!owner) notFound();
  const viewer = await currentUser();
  return (
    <MyList
      signedIn={viewer !== null}
      owner={owner.name}
      {...(await agedLibrary(owner.id))}
      people={followedPeople(owner.id)}
      loved={[]}
    />
  );
}
