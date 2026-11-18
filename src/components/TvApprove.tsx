"use client";

import { useState } from "react";

/**
 * "Sign this Apple TV in as me": the code from the TV's screen, and one button.
 * The code arrives in the QR's link; it can also be typed, for a phone whose
 * camera would not read the screen.
 */
export function TvApprove({ name, code, waiting }: { name: string; code: string | null; waiting: boolean }) {
  const [typed, setTyped] = useState(code ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(
    code && !waiting ? "No Apple TV is showing that code. It may have expired — check the TV." : null,
  );

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/tv/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: typed }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return setDone(true);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error ?? "That didn't go through. Try again.");
  }

  if (done) {
    return (
      <p className="mt-3 text-[15px]" role="status">
        Done — your Apple TV is signing in as <span className="font-semibold">{name}</span>.
      </p>
    );
  }

  return (
    <form onSubmit={approve} className="mt-1.5 flex flex-col gap-3">
      <p className="text-[13.5px] text-ink-faint">
        This signs the Apple TV showing this code into your account,{" "}
        <span className="text-ink">{name}</span>. Only go on if the code matches the one on your own TV.
      </p>
      <input
        name="code"
        value={typed}
        onChange={(e) => setTyped(e.target.value.toUpperCase())}
        placeholder="Code on the TV"
        aria-label="Code on the TV"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={12}
        className="rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-center font-mono text-[22px] tracking-[0.3em] outline-none transition focus:border-like"
      />
      {error ? (
        <p className="text-[13px] text-against" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || typed.trim().length < 6}
        className="min-h-11 rounded-lg bg-ink px-4 text-[14px] font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign this Apple TV in"}
      </button>
    </form>
  );
}
