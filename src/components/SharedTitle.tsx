"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MediaKind } from "@/db/schema";

/* The sheet draws itself onto document.body, which the server does not have:
   rendered straight from a link, it has to wait for the browser. */
const TitleSheet = dynamic(() => import("./TitleSheet").then((m) => m.TitleSheet), { ssr: false });

/** A shared link lands on the title's sheet; closing it goes on to Home. */
export function SharedTitle({ tmdbId, kind, signedIn }: { tmdbId: number; kind: MediaKind; signedIn: boolean }) {
  const router = useRouter();
  return (
    <>
      <div aria-hidden className="fixed inset-0 -z-10 bg-black" />
      <TitleSheet tmdbId={tmdbId} kind={kind} signedIn={signedIn} onClose={() => router.push("/")} />
    </>
  );
}
