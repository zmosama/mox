"use client";

import Link from "next/link";
import { useState } from "react";
import { Grid } from "./Grid";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import { usePaged } from "./usePaged";
import { cn } from "@/lib/cn";
import type { MediaKind } from "@/db/schema";

const SORTS = [
  ["popular", "Most popular"],
  ["top", "Top rated"],
  ["newest", "Newest"],
] as const;

/** One studio's films or series, ten at a time as you scroll. */
export function StudioWorks({
  slug,
  name,
  logo,
  kinds,
  signedIn,
}: {
  slug: string;
  name: string;
  logo: string;
  kinds: MediaKind[];
  signedIn: boolean;
}) {
  const [kind, setKind] = useState<MediaKind>(kinds[0]);
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("popular");
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);

  const { sentinel, ...list } = usePaged<CardTitle>(`/api/studios/${slug}?kind=${kind}&sort=${sort}`, (body) => ({
    items: (body.results as CardTitle[]) ?? [],
    next: (body.next as number | null) ?? null,
  }));

  return (
    <>
      <Link href="/studios" className="mb-4 inline-block text-[13px] text-ink-dim transition hover:text-ink">
        ‹ Studios
      </Link>
      <div className="mb-5 flex items-center gap-4">
        <span className="block h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f2f2ee] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- TMDB logo */}
          <img src={logo} alt="" className="size-full object-contain" />
        </span>
        <h1 className="text-[28px] font-bold tracking-tight">{name}</h1>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {kinds.length > 1
          ? kinds.map((k) => (
              <Chip key={k} on={kind === k} onClick={() => setKind(k)}>
                {k === "movie" ? "Films" : "Series"}
              </Chip>
            ))
          : null}
        {kinds.length > 1 ? <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden /> : null}
        {SORTS.map(([id, label]) => (
          <Chip key={id} on={sort === id} onClick={() => setSort(id)}>
            {label}
          </Chip>
        ))}
      </div>

      {list.pending ? (
        <Spinner />
      ) : list.items.length ? (
        <Grid>
          {list.items.map((card) => (
            <TitleCard key={`${card.kind}-${card.tmdbId}`} item={card} onOpen={setOpen} />
          ))}
        </Grid>
      ) : (
        <p className="text-[14px] text-ink-dim">{list.failed ? "Couldn't reach TMDB. Try again in a moment." : "Nothing here yet."}</p>
      )}
      <div ref={sentinel} aria-hidden className="h-px" />
      {list.more ? <Spinner /> : null}

      {open ? <TitleSheet tmdbId={open.tmdbId} kind={open.kind} signedIn={signedIn} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full px-3.5 py-2 text-[13px] font-medium transition",
        on ? "bg-love text-bg" : "bg-card text-ink hover:bg-raised",
      )}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <span aria-label="Loading" className="size-5 animate-spin rounded-full border-2 border-ink-dim border-t-transparent" />
    </div>
  );
}
