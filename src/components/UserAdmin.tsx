"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { toHandle } from "./LoginForm";
import type { ManagedUser } from "@/lib/users";

type Action = "grantAdmin" | "revokeAdmin" | "delete" | "signOutEverywhere" | "update";

/**
 * The people who can sign in, and what they are allowed to do.
 *
 * Every control here is also enforced on the server: hiding a button is a
 * courtesy to the reader, never the thing that stops the action.
 */
export function UserAdmin({ users, isOwner, meId }: {
  users: ManagedUser[];
  isOwner: boolean;
  meId: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  async function act(userId: number, action: Action, extra?: Record<string, string>) {
    setBusy(userId);
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, action, ...extra }),
    });
    setBusy(null);
    setConfirming(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "That didn’t work");
      return false;
    }
    setEditing(null);
    router.refresh();
    return true;
  }

  return (
    <div>
      {!isOwner ? (
        <p className="mb-4 rounded-card border border-line-strong bg-surface px-4 py-3 text-[13px] text-ink-dim">
          Only the owner can change roles or remove accounts.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-4 rounded-card border border-against/40 bg-against/10 px-4 py-3 text-[13px] text-against">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        {users.map((u) => (
          <div
            key={u.id}
            /* Stacked on a phone. Side by side, the buttons and the name were
               competing for the same 375px and drew straight over each other. */
            className="flex flex-col gap-3 border-t border-line px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-x-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[14px] font-semibold">{u.displayName ?? u.username}</b>
                {u.isOwner ? (
                  <Badge className="border-love/40 bg-love/15 text-love">Owner</Badge>
                ) : u.isAdmin ? (
                  <Badge className="border-like/40 bg-like/15 text-like">Admin</Badge>
                ) : (
                  <Badge className="border-line-strong text-ink-faint">User</Badge>
                )}
                {u.id === meId ? (
                  <Badge className="border-line-strong text-ink-faint">You</Badge>
                ) : null}
              </div>
              <div className="numeric mt-0.5 text-[11.5px] text-ink-faint">
                @{u.username} · {u.email ?? "no email"}{u.google ? " · Google" : ""} · {u.rated} rated · {u.follows} followed
              </div>
            </div>

            {isOwner ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Editing a profile is not a role change, so the owner can do
                    it to their own row — what nobody can do is stop being the
                    owner, which is why the buttons below stay hidden there. */}
                <Action
                  onClick={() => setEditing(editing === u.id ? null : u.id)}
                  disabled={busy === u.id}
                >
                  {editing === u.id ? "Close" : "Edit"}
                </Action>
                {u.isOwner ? null : (
                  <>
                <Action
                  onClick={() => act(u.id, u.isAdmin ? "revokeAdmin" : "grantAdmin")}
                  disabled={busy === u.id}
                >
                  {u.isAdmin ? "Revoke admin" : "Make admin"}
                </Action>
                <Action onClick={() => act(u.id, "signOutEverywhere")} disabled={busy === u.id}>
                  Sign out
                </Action>
                {confirming === u.id ? (
                  <>
                    <Action
                      danger
                      onClick={() => act(u.id, "delete")}
                      disabled={busy === u.id}
                    >
                      Delete {u.username} for good
                    </Action>
                    <Action onClick={() => setConfirming(null)}>Cancel</Action>
                  </>
                ) : (
                  /* Deleting takes their ratings and follows with it, so it
                     asks once rather than firing on a single tap. */
                  <Action danger onClick={() => setConfirming(u.id)} disabled={busy === u.id}>
                    Delete
                  </Action>
                )}
                  </>
                )}
              </div>
            ) : null}

            {isOwner && editing === u.id ? (
              <EditUser
                user={u}
                busy={busy === u.id}
                onSave={(changes) => act(u.id, "update", changes)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

type Changes = { username: string; displayName: string; email: string; password?: string };

/**
 * Edit one account in place.
 *
 * The password box is blank on purpose and blank means "leave it": a reset is
 * something you do deliberately, not something that happens because a field
 * was pre-filled and you saved a name change.
 */
function EditUser({
  user,
  busy,
  onSave,
}: {
  user: ManagedUser;
  busy: boolean;
  onSave: (changes: Changes) => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(user.email ?? "");

  const shortName = username.length > 0 && username.length < 3;
  const shortPass = password.length > 0 && password.length < 8;
  const blocked = busy || shortName || shortPass || username.length === 0;

  return (
    <form
      className="grid gap-3 rounded-card border border-line-strong bg-bg p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ username, displayName, email, ...(password ? { password } : {}) });
      }}
    >
      <EditField label="Name" value={displayName} onChange={setDisplayName} placeholder="Optional" />
      <EditField
        label="Username"
        value={username}
        onChange={(v) => setUsername(toHandle(v))}
        problem={shortName ? "3 characters at least." : null}
      />
      <EditField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="Their Google address"
        hint="Google sign-in with this address opens this account."
      />
      <EditField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        placeholder="Leave blank to keep"
        problem={shortPass ? "8 characters at least." : null}
        hint={
          password
            ? "Saving this signs them out everywhere, including this browser if it is you."
            : undefined
        }
      />
      <div className="flex items-end">
        <button
          type="submit"
          disabled={blocked}
          className="min-h-11 w-full rounded-lg bg-ink px-4 text-[13px] font-semibold text-bg transition hover:opacity-90 disabled:opacity-40 sm:min-h-0 sm:py-2"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function EditField({
  label,
  value,
  onChange,
  problem,
  hint,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  problem?: string | null;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-dim">{label}</span>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize="none"
        spellCheck={false}
        className={cn(
          "rounded-lg border bg-surface px-3 py-2 text-[14px] outline-none transition",
          problem ? "border-against" : "border-line-strong focus:border-like",
        )}
      />
      {problem ? (
        <span className="text-[11px] text-against">{problem}</span>
      ) : hint ? (
        <span className="text-[11px] text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", className)}>
      {children}
    </span>
  );
}

function Action({
  children,
  danger,
  ...props
}: { danger?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "min-h-11 rounded-lg border px-3 text-[12.5px] font-semibold transition disabled:opacity-50 sm:min-h-0 sm:py-1.5",
        danger
          ? "border-against/40 text-against hover:bg-against/10"
          : "border-line-strong text-ink-dim hover:border-ink-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
