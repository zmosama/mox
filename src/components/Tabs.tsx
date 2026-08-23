"use client";

import { cn } from "@/lib/cn";

/**
 * A set of mutually exclusive choices, sized to the screen.
 *
 * These were a row that scrolled sideways, which cut the last option in half
 * at the screen edge — "Everything" arriving as "Everythin" reads as a broken
 * layout, not as an invitation to scroll. Equal columns across the full width
 * mean every option is visible and reachable without moving anything.
 *
 * Only for small sets. Past four the columns get too narrow to read, so a
 * longer list wants a different control.
 */
export function Tabs({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [id: string, label: string][];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("grid gap-1 rounded-xl border border-line-strong bg-surface p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "min-h-11 truncate rounded-lg px-1.5 text-[12.5px] font-semibold transition sm:min-h-0 sm:py-1.5 sm:text-[13px]",
            value === id
              ? "bg-ink text-bg shadow-card"
              : "text-ink-dim active:text-ink sm:hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
