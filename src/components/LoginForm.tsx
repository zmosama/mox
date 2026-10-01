"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { GoogleButton } from "./GoogleButton";

type Mode = "in" | "up";

/**
 * Sign in, or create an account.
 *
 * One form with two modes rather than two pages: the fields are the same and
 * a second route would be a second place for the styling to drift. A new
 * account is always a plain user — the server decides that, not this form.
 */
export function LoginForm({ googleClientId }: { googleClientId?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Sign-up only. The handle follows the name until the person edits it
     themselves, at which point it is theirs and we stop rewriting it. */
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [touched, setTouched] = useState(false);

  /* An Arabic or otherwise non-Latin name reduces to nothing here, so the
     field would just sit empty with no explanation. */
  const usernameProblem =
    mode !== "up"
      ? null
      : username.length === 0 && name.trim().length > 0
        ? "Pick a username in Latin letters or digits."
        : username.length > 0 && username.length < 3
          ? "A bit short — 3 characters at least."
          : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(e.currentTarget);
    const body = {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(mode === "up"
        ? { displayName: String(form.get("displayName") ?? ""), email: String(form.get("email") ?? "") }
        : {}),
    };

    const res = await fetch(mode === "up" ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    setBusy(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? (mode === "up" ? "Could not create the account" : "Could not sign in"));
      return;
    }

    // A server component reads the session, so the tree has to be refetched.
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="mt-7">
      {googleClientId ? (
        <>
          <GoogleButton clientId={googleClientId} onError={setError} onSignedIn={() => {
            router.replace("/admin");
            router.refresh();
          }} />
          <div className="my-5 flex items-center gap-3 text-[12px] text-ink-faint">
            <span className="h-px flex-1 bg-line" /> or with a password <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <div
        role="tablist"
        className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface p-1"
      >
        {(
          [
            ["in", "Sign in"],
            ["up", "Create account"],
          ] as [Mode, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setMode(id);
              setError(null);
            }}
            className={cn(
              "min-h-11 rounded-lg px-2 text-[13px] font-semibold transition sm:min-h-0 sm:py-2",
              mode === id ? "bg-ink text-bg shadow-card" : "text-ink-dim sm:hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* `key` remounts the fields on a mode change, so the browser offers the
          right saved credentials and a half-typed password does not carry over. */}
      <form key={mode} onSubmit={submit} className="flex flex-col gap-3">
        {/* Your name first, then the handle. The other way round, the top field
            said "Username" and everybody typed their actual name into it —
            which is what "Display name" underneath was asking for. */}
        {mode === "up" ? (
          <Field
            label="Your name"
            name="displayName"
            autoComplete="name"
            placeholder="Ahmed Fouad"
            value={name}
            onChange={(e) => {
              const next = e.target.value;
              setName(next);
              /* Keep offering a handle until they write their own. Tidied of
                 a trailing separator here but NOT inside toHandle: doing it on
                 every keystroke would eat the "_" of someone typing their own
                 "ahmed_fouad" before they reached the rest of it. */
              if (!touched) setUsername(toHandle(next).replace(/[._-]+$/, ""));
            }}
          />
        ) : null}

        {mode === "up" ? (
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            hint="You can sign in with it, too."
          />
        ) : null}

        <Field
          label={mode === "up" ? "Username" : "Username or email"}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={mode === "up" ? username : undefined}
          onChange={
            mode === "up"
              ? (e) => {
                  setTouched(true);
                  // Corrected as it is typed rather than rejected on submit:
                  // a space becomes an underscore, capitals come down.
                  setUsername(toHandle(e.target.value));
                }
              : undefined
          }
          hint={
            mode === "up"
              ? "What you sign in with. Lowercase, no spaces — 3 to 32 characters."
              : undefined
          }
          problem={mode === "up" ? usernameProblem : undefined}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          required
          minLength={mode === "up" ? 8 : undefined}
          hint={mode === "up" ? "At least 8 characters." : undefined}
        />

        {error ? (
          <p role="alert" className="text-[13px] text-against">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 min-h-11 rounded-lg bg-ink px-4 text-[14px] font-semibold text-bg transition hover:opacity-90 disabled:opacity-50 sm:min-h-0 sm:py-2.5"
        >
          {busy
            ? mode === "up"
              ? "Creating…"
              : "Checking…"
            : mode === "up"
              ? "Create account"
              : "Sign in"}
        </button>

        {mode === "up" ? (
          <p className="text-[12px] leading-relaxed text-ink-faint">
            A new account starts empty and sees the same public pages. Ratings and
            followed shows are yours alone.
          </p>
        ) : null}
      </form>
    </div>
  );
}

/**
 * Turn anything typed into a usable handle.
 *
 * "Ahmed Fouad" comes back as "ahmed_fouad" instead of being refused: runs of
 * anything not allowed collapse into a single underscore, accents are stripped
 * rather than dropped, and it cannot start with a separator or run past the
 * 32 characters the server accepts.
 */
export function toHandle(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 32);
}

function Field({
  label,
  hint,
  problem,
  ...props
}: {
  label: string;
  hint?: string;
  /** Shown under this field. A rule broken here is not explained at the bottom. */
  problem?: string | null;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-dim">{label}</span>
      <input
        {...props}
        aria-invalid={problem ? true : undefined}
        className={cn(
          "rounded-lg border bg-surface px-3.5 py-2.5 text-[15px] outline-none transition",
          problem ? "border-against" : "border-line-strong focus:border-like",
        )}
      />
      {problem ? (
        <span className="text-[11.5px] text-against">{problem}</span>
      ) : hint ? (
        <span className="text-[11.5px] text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}
