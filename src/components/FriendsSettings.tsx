"use client";

import { useEffect, useState } from "react";
import { FriendFace } from "./Friends";
import type { Friend } from "@/lib/friends";

/**
 * Your friends on MOX: add one by their username or email, remove one. Both
 * of you see each other's ratings from the moment either adds the other.
 */
export function FriendsSettings({ initial, username }: { initial: Friend[]; username: string }) {
  const [friends, setFriends] = useState(initial);
  const [who, setWho] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ q: string; people: Friend[] }>({ q: "", people: [] });
  const typed = who.trim();

  // Suggestions from the first letter, as you type.
  useEffect(() => {
    if (!typed) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const body = (await (await fetch(`/api/friends/search?q=${encodeURIComponent(typed)}`)).json()) as { people: Friend[] };
        if (live) setFound({ q: typed, people: body.people ?? [] });
      } catch {
        // No suggestions is fine: the full username still works.
      }
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typed, friends.length]);
  const suggestions = typed && found.q === typed ? found.people : [];

  async function call(method: "POST" | "DELETE", body: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/friends", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await res.json().catch(() => null)) as { error?: string; friends?: Friend[]; friend?: Friend } | null;
      if (!res.ok) {
        setMessage({ ok: false, text: payload?.error ?? "That did not work" });
        return;
      }
      setFriends(payload?.friends ?? friends);
      if (payload?.friend) {
        setWho("");
        setMessage({ ok: true, text: `${payload.friend.name} is your friend now.` });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="friends" className="scroll-mt-6">
      <h2 className="mb-1 text-base font-semibold">Friends</h2>
      <p className="mb-3 text-[13px] text-ink-faint">
        Friends see what you rated, and you see theirs — on search, a title&apos;s page and the Friends tab. Your username is{" "}
        <span className="font-semibold text-ink">{username}</span>.
      </p>

      {friends.length ? (
        <ul className="mb-3 flex flex-col divide-y divide-line rounded-card border border-line bg-card">
          {friends.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <FriendFace friend={f} size={32} className="ring-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{f.name}</span>
                <span className="block truncate text-[12px] text-ink-faint">@{f.username}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${f.name}? Neither of you will see the other's ratings.`)) void call("DELETE", { id: f.id });
                }}
                className="rounded-lg px-2.5 py-1.5 text-[13px] text-against transition hover:bg-white/5 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (suggestions.length) void call("POST", { id: suggestions[0].id });
          else if (typed) void call("POST", { who });
        }}
        className="relative flex gap-2"
      >
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="Start typing a name"
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] outline-none transition focus:border-like"
        />
        <button
          type="submit"
          disabled={busy || !typed}
          className="min-h-11 rounded-lg bg-ink px-4 text-[13px] font-semibold text-bg transition hover:opacity-90 disabled:opacity-50 sm:min-h-0 sm:py-2"
        >
          Add
        </button>
        {suggestions.length ? (
          <ul className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-card border border-line-strong bg-card shadow-pop">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void call("POST", { id: p.id })}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-start transition hover:bg-white/5"
                >
                  <FriendFace friend={p} size={28} className="ring-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    <span className="block truncate text-[12px] text-ink-faint">@{p.username}</span>
                  </span>
                  <span className="text-[13px] font-semibold text-love">+ Add</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      {message ? (
        <p className={`mt-2 text-[13px] ${message.ok ? "text-love" : "text-against"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}
