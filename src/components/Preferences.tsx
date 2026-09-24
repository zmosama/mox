"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

type TabOption = { id: string; label: string; interest: boolean; appOnly: boolean };
type Prefs = { tabs: string[]; newsLangs: ("en" | "ar")[]; f1Shield: boolean };

/**
 * The account's preferences, shared with the app: which tabs sit either side
 * of the ring and in what order, the news languages, the F1 spoiler shield.
 * Every change saves at once; the bar below redraws with it.
 */
export function Preferences({
  initial,
  options,
  slots,
}: {
  initial: Prefs;
  options: TabOption[];
  slots: number;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setError(null);
    const res = await fetch("/api/account/prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setError("Couldn't save that — try again.");
      setPrefs(prefs);
      return;
    }
    router.refresh();
  };

  const label = (id: string) => options.find((o) => o.id === id)?.label ?? id;
  const move = (i: number, by: number) => {
    const tabs = [...prefs.tabs];
    const j = i + by;
    if (j < 0 || j >= tabs.length) return;
    [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
    save({ tabs });
  };
  const unused = options.filter((o) => !prefs.tabs.includes(o.id));
  const half = Math.ceil(prefs.tabs.length / 2);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-1 text-base font-semibold">Tabs</h2>
        <p className="mb-3 text-[13px] text-ink-faint">
          Up to {slots}, either side of the ring. The same on the website and in the app — Calendar and Tasks
          only appear in the app.
        </p>
        <ol className="overflow-hidden rounded-card border border-line bg-card">
          {prefs.tabs.map((id, i) => (
            <li key={id}>
              {i === half ? (
                <div className="flex items-center gap-2 border-b border-line bg-surface px-3.5 py-2 text-[12px] text-ink-faint">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset */}
                  <img src="/ring-tab.png" alt="" className="size-4" /> The ring — always in the middle
                </div>
              ) : null}
              <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 last:border-0">
                <span className="flex-1 text-[14px] font-medium">
                  {label(id)}
                  {options.find((o) => o.id === id)?.appOnly ? (
                    <span className="ms-2 text-[11.5px] font-normal text-ink-faint">app only</span>
                  ) : null}
                </span>
                <IconButton label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>↑</IconButton>
                <IconButton label="Move right" disabled={i === prefs.tabs.length - 1} onClick={() => move(i, 1)}>↓</IconButton>
                <IconButton
                  label="Remove"
                  disabled={prefs.tabs.length <= 1}
                  onClick={() => save({ tabs: prefs.tabs.filter((t) => t !== id) })}
                >
                  ×
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
        {unused.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-ink-faint">
              {prefs.tabs.length >= slots ? "Remove one to add:" : "Add:"}
            </span>
            {unused.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={prefs.tabs.length >= slots}
                onClick={() => save({ tabs: [...prefs.tabs, o.id] })}
                className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12.5px] transition hover:bg-card disabled:opacity-40"
              >
                + {o.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">News</h2>
        <p className="mb-3 text-[13px] text-ink-faint">Which newsrooms to read.</p>
        <div className="flex gap-2">
          {(["en", "ar"] as const).map((l) => {
            const on = prefs.newsLangs.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                // At least one: a news tab with no languages would only ever be empty.
                disabled={on && prefs.newsLangs.length === 1}
                onClick={() => save({ newsLangs: on ? prefs.newsLangs.filter((x) => x !== l) : [...prefs.newsLangs, l] })}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13px] font-medium transition",
                  on ? "bg-love/20 text-love" : "bg-surface text-ink-dim hover:bg-card",
                )}
              >
                {l === "en" ? "English" : "عربي"}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">F1</h2>
        <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-card px-3.5 py-3">
          <input
            type="checkbox"
            checked={prefs.f1Shield}
            onChange={(e) => save({ f1Shield: e.target.checked })}
            className="mt-0.5 size-4 accent-[var(--color-love)]"
          />
          <span>
            <span className="block text-[14px] font-medium">Hide results until I&apos;ve watched</span>
            <span className="block text-[12.5px] text-ink-faint">
              A race&apos;s result, and the standings it changed, stay covered until you say you&apos;ve seen it.
            </span>
          </span>
        </label>
      </section>

      {error ? <p className="text-[13px] text-against">{error}</p> : null}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-[15px] text-ink-dim transition hover:bg-surface hover:text-ink disabled:opacity-25"
    >
      {children}
    </button>
  );
}
