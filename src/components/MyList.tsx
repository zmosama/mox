"use client";

import Link from "next/link";
import { useState } from "react";
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
}: {
  signedIn: boolean;
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
      <h1 className="mb-7 text-[28px] font-bold tracking-tight">My List</h1>

      {!signedIn ? (
        <div className="flex flex-col items-center gap-3 rounded-[20px] bg-surface px-6 py-6 text-center">
          <p className="text-[14px] text-ink-dim">Sign in to see the shows you follow and your watchlist.</p>
          <Link href="/admin/login" className="rounded-full bg-love px-5 py-2 text-[14px] font-semibold text-bg">
            Sign in
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <Shelf title="Following" cards={following} empty="Follow a show from its page and it lands here." onOpen={setOpen} />
          {people.length ? (
            <PeopleRow title="People you follow" people={people} onOpen={openPerson} />
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
