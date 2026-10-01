"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Account = {
  username: string;
  email: string | null;
  hasPassword: boolean;
  google: boolean;
  isOwner: boolean;
};

const input =
  "rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] outline-none transition focus:border-like";
const button =
  "min-h-11 rounded-lg bg-ink px-4 text-[13px] font-semibold text-bg transition hover:opacity-90 disabled:opacity-50 sm:min-h-0 sm:py-2";

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  return res.ok ? null : (payload?.error ?? "That did not work");
}

/**
 * Email, password and deleting the account — the things a person must be able
 * to do for themselves. Anything sensitive asks for the current password,
 * unless the account was made with Google and has never had one.
 */
export function AccountSettings({ initial }: { initial: Account }) {
  const router = useRouter();
  const [account, setAccount] = useState(initial);
  const [open, setOpen] = useState<"email" | "password" | "delete" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = String(f.get("current") ?? "") || undefined;
    setBusy(true);
    setMessage(null);
    let error: string | null = null;
    if (open === "email") {
      const email = String(f.get("email") ?? "");
      error = await send("/api/account/email", "POST", { email, password: current });
      if (!error) setAccount({ ...account, email: email.trim().toLowerCase() });
    } else if (open === "password") {
      error = await send("/api/account/password", "POST", { current, next: String(f.get("next") ?? "") });
      if (!error) setAccount({ ...account, hasPassword: true });
    } else if (open === "delete") {
      error = await send("/api/account/me", "DELETE", { password: current });
      if (!error) {
        router.replace("/");
        router.refresh();
        return;
      }
    }
    setBusy(false);
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: open === "email" ? "Email changed." : "Password changed. Other devices were signed out." });
      setOpen(null);
    }
  }

  const currentField = account.hasPassword ? (
    <input className={input} name="current" type="password" autoComplete="current-password" placeholder="Current password" required />
  ) : null;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Account</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
        <dt className="text-ink-faint">Username</dt>
        <dd>{account.username}</dd>
        <dt className="text-ink-faint">Email</dt>
        <dd>{account.email ?? <span className="text-ink-faint">none yet</span>}</dd>
        <dt className="text-ink-faint">Sign-in</dt>
        <dd>{[account.hasPassword && "Password", account.google && "Google"].filter(Boolean).join(" · ")}</dd>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["email", account.email ? "Change email" : "Add email"],
            ["password", account.hasPassword ? "Change password" : "Set a password"],
            ...(account.isOwner ? [] : [["delete", "Delete account"]]),
          ] as [typeof open, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setOpen(open === id ? null : id);
              setMessage(null);
            }}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition ${
              id === "delete" ? "border-against/50 text-against" : "border-line-strong text-ink-dim hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {open ? (
        <form key={open} onSubmit={submit} className="mt-3 flex max-w-sm flex-col gap-2.5">
          {open === "email" ? (
            <input className={input} name="email" type="email" autoComplete="email" placeholder="New email" required />
          ) : null}
          {open === "password" ? (
            <input className={input} name="next" type="password" autoComplete="new-password" minLength={8} placeholder="New password (8+ characters)" required />
          ) : null}
          {open === "delete" ? (
            <p className="text-[13px] text-against">
              This deletes your ratings, followed shows, watchlist and everything else in the account. It cannot be undone.
            </p>
          ) : null}
          {currentField}
          <button type="submit" disabled={busy} className={open === "delete" ? `${button} bg-against` : button}>
            {busy ? "…" : open === "email" ? "Save email" : open === "password" ? "Save password" : "Delete my account"}
          </button>
        </form>
      ) : null}

      {message ? (
        <p role="status" className={`mt-2 text-[13px] ${message.ok ? "text-like" : "text-against"}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
