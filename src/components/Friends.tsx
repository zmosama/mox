import { cn } from "@/lib/cn";
import type { Verdict } from "@/db/schema";
import type { FriendMark } from "@/lib/friends";

/** How a friend's verdict reads after their name. Same words as the app. */
export const FRIEND_VERB: Record<Verdict, string> = {
  love: "loves it",
  like: "likes it",
  dislike: "didn't like it",
  watchlist: "wants to watch it",
  seen: "has seen it",
  hidden: "isn't interested",
};

/** A friend's face, or their initial when they have no photo. */
export function FriendFace({ friend, size = 20, className }: { friend: { name: string; avatar: string | null }; size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-love-soft font-semibold text-bg ring-2 ring-bg", className)}
    >
      {friend.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small, already-sized photo
        <img src={friend.avatar} alt="" className="size-full object-cover" />
      ) : (
        friend.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

/**
 * "Sara loves it", with her face — on search results, a studio's list and a
 * title. More than one friend: the latest, and how many others.
 */
export function FriendsLine({ friends, className }: { friends?: FriendMark[]; className?: string }) {
  if (!friends?.length) return null;
  const [first, ...rest] = friends;
  return (
    <div className={cn("flex items-center gap-2 text-[12px] font-medium text-love-soft", className)}>
      <span className="flex -space-x-1.5">
        {friends.slice(0, 3).map((f) => (
          <FriendFace key={f.id} friend={f} />
        ))}
      </span>
      <span className="truncate">
        {first.name} {FRIEND_VERB[first.verdict]}
        {rest.length ? <span className="text-ink-dim"> · +{rest.length}</span> : null}
      </span>
    </div>
  );
}

/** Every friend's verdict on one title, for its page. */
export function FriendsOnTitle({ friends }: { friends?: FriendMark[] }) {
  if (!friends?.length) return null;
  return (
    <ul className="flex flex-col gap-2 rounded-card bg-surface px-3.5 py-3">
      {friends.map((f) => (
        <li key={f.id} className="flex items-center gap-2.5 text-[14px]">
          <FriendFace friend={f} size={26} className="ring-0" />
          <span>
            <span className="font-semibold">{f.name}</span> <span className="text-ink/80">{FRIEND_VERB[f.verdict]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
