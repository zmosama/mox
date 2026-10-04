"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Grid } from "./Grid";
import { PeopleRow, type PersonChipData } from "./People";
import { PersonSheet } from "./PersonSheet";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import type { MediaKind } from "@/db/schema";

export function MyList({
  signedIn,
  following,
  watchlist,
  people,
  loved,
  owner,
  shareUrl,
}: {
  signedIn: boolean;
  /** Someone else's list, opened from a link they shared: whose it is. */
  owner?: string;
  /** Your own list's public address, for the Share button. */
  shareUrl?: string;
  following: CardTitle[];
  watchlist: CardTitle[];
  /** Actors and directors you follow. */
  people: PersonChipData[];
  /** The people who keep turning up in what you rated well. */
  loved: (PersonChipData & { seen: number })[];
}) {
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const openPerson = (p: PersonChipData) => setPerson(p.id);

  return (
    <>
      <div className="mb-7 flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-[28px] font-bold tracking-tight">{owner ? `${owner}’s list` : "My List"}</h1>
        {shareUrl ? <ShareList url={shareUrl} /> : null}
      </div>
      {owner ? (
        <p className="-mt-5 mb-7 text-[14px] text-ink-dim">
          What {owner} follows and wants to watch, on{" "}
          <Link href="/" className="text-love">
            mox
          </Link>
          .
        </p>
      ) : null}

      {!signedIn && !owner ? (
        <div className="flex flex-col items-center gap-3 rounded-[20px] bg-surface px-6 py-6 text-center">
          <p className="text-[14px] text-ink-dim">Sign in to see the shows you follow and your watchlist.</p>
          <Link href="/admin/login" className="rounded-full bg-love px-5 py-2 text-[14px] font-semibold text-bg">
            Sign in
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <Shelf title="Following" cards={following} empty={owner ? "No shows followed yet." : "Follow a show from its page and it lands here."} onOpen={setOpen} />
          {people.length ? (
            <PeopleRow title={owner ? "People they follow" : "People you follow"} people={people} onOpen={openPerson} />
          ) : null}
          <Shelf title="Watchlist" cards={watchlist} empty="Nothing saved for later yet." onOpen={setOpen} />
          {loved.length ? (
            <PeopleRow
              title="People you love"
              people={loved.map((p) => ({ ...p, role: `In ${p.seen} you rated well` }))}
              onOpen={openPerson}
            />
          ) : null}
        </div>
      )}

      {open ? (
        <TitleSheet tmdbId={open.tmdbId} kind={open.kind} signedIn={signedIn} onClose={() => setOpen(null)} />
      ) : null}
      {person !== null ? <PersonSheet id={person} signedIn={signedIn} onClose={() => setPerson(null)} /> : null}
    </>
  );
}

/**
 * A link to this list that anyone can open, with or without an account: the
 * phone's share sheet where there is one, a copied link on a desktop.
 */
function ShareList({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: "My list on mox", url }).catch(() => null);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Link copied" : "Share my list"}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition",
        copied ? "bg-love/20 text-love" : "bg-surface text-ink hover:bg-card",
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
        <path d={copied ? "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" : "M16 5l-1.4 1.4-1.6-1.6V15h-2V4.8L9.4 6.4 8 5l4-4 4 4zm4 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h3v2H6v11h12V10h-3V8h3a2 2 0 0 1 2 2z"} />
      </svg>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

function Shelf({
  title,
  cards,
  empty,
  onOpen,
}: {
  title: string;
  cards: CardTitle[];
  empty: string;
  onOpen: (r: { tmdbId: number; kind: MediaKind }) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-[20px] font-semibold tracking-tight">
        {title}
        {cards.length ? <span className="numeric text-[13px] font-normal text-ink-dim">{cards.length}</span> : null}
      </h2>
      {cards.length ? (
        <Grid>
          {cards.map((c) => (
            <TitleCard key={`${c.kind}-${c.tmdbId}`} item={c} onOpen={onOpen} />
          ))}
        </Grid>
      ) : (
        <p className="text-[14px] text-ink-dim">{empty}</p>
      )}
    </section>
  );
}
