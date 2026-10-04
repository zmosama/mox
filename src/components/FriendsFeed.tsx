"use client";

import Link from "next/link";
import { useState } from "react";
import { FRIEND_VERB, FriendFace } from "./Friends";
import { Chip, Spinner } from "./StudioWorks";
import type { CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import { usePaged } from "./usePaged";
import type { Friend, FriendMark } from "@/lib/friends";
import type { MediaKind, Verdict } from "@/db/schema";

type Item = { friend: FriendMark; at: number; title: CardTitle };

const VERDICTS: [Verdict | null, string][] = [
  [null, "Everything"],
  ["love", "Loved"],
  ["like", "Liked"],
  ["watchlist", "Want to watch"],
  ["seen", "Seen"],
  ["dislike", "Didn't like"],
];

const ago = (at: number) => {
  const days = Math.floor((Date.now() / 1000 - at) / 86400);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * Friends: what they rated, newest first. Pick one of them to see only theirs,
 * or one kind of verdict to see only what they loved. Twenty at a time.
 */
export function FriendsFeed({ signedIn }: { signedIn: boolean }) {
  const [friend, setFriend] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);

  const query = new URLSearchParams();
  if (friend !== null) query.set("friend", String(friend));
  if (verdict) query.set("verdict", verdict);
  const { sentinel, ...feed } = usePaged<Item, Friend[] | undefined>(signedIn ? `/api/friends/activity?${query}` : null, (body) => {
    if (body.friends && !friends) setFriends(body.friends as Friend[]);
    return { items: (body.items as Item[]) ?? [], next: (body.next as number | null) ?? null };
  });

  return (
    <>
      <h1 className="mb-7 text-[28px] font-bold tracking-tight">Friends</h1>

      {!signedIn ? (
        <Prompt text="Sign in to see what your friends are watching." href="/admin/login" action="Sign in" />
      ) : friends && !friends.length ? (
        <Prompt
          text="Add friends in Settings — type a name and pick them. What they rate shows up here, and what you rate shows up for them."
          href="/admin#friends"
          action="Add friends"
        />
      ) : (
        <>
          {friends ? (
            <div className="strip -mx-4 mb-3 gap-2 px-4">
              <Chip on={friend === null} onClick={() => setFriend(null)}>
                All friends
              </Chip>
              {friends.map((f) => (
                <Chip key={f.id} on={friend === f.id} onClick={() => setFriend(f.id)}>
                  <span className="flex items-center gap-1.5">
                    <FriendFace friend={f} size={18} className="ring-0" />
                    {f.name}
                  </span>
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="strip -mx-4 mb-6 gap-2 px-4">
            {VERDICTS.map(([v, label]) => (
              <Chip key={label} on={verdict === v} onClick={() => setVerdict(v)}>
                {label}
              </Chip>
            ))}
          </div>

          {feed.pending ? (
            <Spinner />
          ) : feed.items.length ? (
            <ul className="mx-auto flex max-w-[760px] flex-col gap-1">
              {feed.items.map((item) => (
                <li key={`${item.friend.id}-${item.title.kind}-${item.title.tmdbId}`}>
                  <Row item={item} onOpen={() => setOpen(item.title)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-dim">Nothing rated here yet.</p>
          )}
          <div ref={sentinel} aria-hidden className="h-px" />
          {feed.more ? <Spinner /> : null}
        </>
      )}

      {open ? <TitleSheet tmdbId={open.tmdbId} kind={open.kind} signedIn={signedIn} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Row({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const { title: card, friend } = item;
  const meta = [card.year, card.kind === "tv" ? "Series" : "Film", card.rating ? `★ ${card.rating.toFixed(1)}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3.5 rounded-card py-2 text-start transition hover:bg-white/[0.03]">
      {/* eslint-disable-next-line @next/next/no-img-element -- TMDB poster */}
      {card.poster ? <img src={card.poster} alt="" className="h-[93px] w-[62px] shrink-0 rounded-[10px] object-cover" loading="lazy" /> : (
        <span className="h-[93px] w-[62px] shrink-0 rounded-[10px] bg-surface" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[13px]">
          <FriendFace friend={friend} size={22} className="ring-0" />
          <span className="truncate">
            <span className="font-semibold">{friend.name}</span>{" "}
            <span className="text-love-soft">{FRIEND_VERB[friend.verdict]}</span>
          </span>
          <span className="numeric ms-auto shrink-0 text-[11.5px] text-ink-faint">{ago(item.at)}</span>
        </span>
        <span className="mt-1.5 block text-[16px] font-semibold leading-snug">{card.title}</span>
        <span className="numeric mt-1 block text-[12px] text-ink-dim">{meta}</span>
        {card.platforms.length ? (
          <span className="mt-1 block truncate text-[12px] text-ink-dim">{card.platforms.map((p) => p.name).join(" · ")}</span>
        ) : null}
      </span>
    </button>
  );
}

function Prompt({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] bg-surface px-6 py-6 text-center">
      <p className="max-w-md text-[14px] text-ink-dim">{text}</p>
      <Link href={href} className="rounded-full bg-love px-5 py-2 text-[14px] font-semibold text-bg">
        {action}
      </Link>
    </div>
  );
}
