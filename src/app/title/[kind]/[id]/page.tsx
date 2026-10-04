import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedTitle } from "@/components/SharedTitle";
import { currentUser } from "@/lib/auth";
import { posterPath } from "@/lib/tmdb";
import { titleDetail } from "@/lib/catalog";
import { MEDIA_KINDS, type MediaKind } from "@/db/schema";

type Params = { params: Promise<{ kind: string; id: string }> };

async function parse(params: Params["params"]) {
  const { kind, id } = await params;
  const tmdbId = Number(id);
  if (!MEDIA_KINDS.includes(kind as MediaKind) || !Number.isInteger(tmdbId) || tmdbId <= 0) notFound();
  return { kind: kind as MediaKind, tmdbId };
}

/**
 * What a shared link shows before anyone opens it — the poster and the name
 * in WhatsApp or Messages, rather than a bare address.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { kind, tmdbId } = await parse(params);
  try {
    const d = await titleDetail<{
      title?: string;
      name?: string;
      overview?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      backdrop_path?: string | null;
    }>(kind, tmdbId);
    const title = d.title ?? d.name ?? "mox";
    const year = (d.release_date ?? d.first_air_date ?? "").slice(0, 4);
    const image = posterPath(d.backdrop_path, "w780") ?? posterPath(d.poster_path, "w500");
    const description = d.overview?.slice(0, 200) || "Where to watch it, on mox.";
    return {
      title: year ? `${title} (${year}) · mox` : `${title} · mox`,
      description,
      openGraph: { title, description, type: "video.other", images: image ? [image] : [] },
      twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
    };
  } catch {
    return { title: "mox" };
  }
}

/** A shared film or series: its sheet, open, for anyone with the link. */
export default async function TitlePage({ params }: Params) {
  const { kind, tmdbId } = await parse(params);
  const user = await currentUser();
  return <SharedTitle tmdbId={tmdbId} kind={kind} signedIn={Boolean(user)} />;
}
