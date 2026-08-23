"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ServiceChoice } from "@/lib/services";

export function ServiceSettings({ services }: { services: ServiceChoice[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    () => new Set(services.filter((s) => s.selected).map((s) => s.providerId)),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(providerId: number) {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerIds: [...selected] }),
    });
    setBusy(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not save your services.");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {services.map((service) => {
          const on = selected.has(service.providerId);
          return (
            <button
              key={service.providerId}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(service.providerId)}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-card border px-3 text-start transition",
                on
                  ? "border-love bg-love/10 text-ink"
                  : "border-line-strong bg-surface text-ink-dim hover:border-ink-faint",
              )}
            >
              {service.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- provider-owned square logo
                <img src={service.logo} alt="" className="size-8 rounded-lg object-cover" />
              ) : (
                <span className="grid size-8 place-items-center rounded-lg bg-raised font-bold">
                  {service.name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0 flex-1 text-[13px] font-semibold">{service.name}</span>
              <span aria-hidden className={on ? "text-love" : "text-ink-faint"}>
                {on ? "✓" : "+"}
              </span>
            </button>
          );
        })}
      </div>

      {error ? <p role="alert" className="mt-3 text-[13px] text-against">{error}</p> : null}
      {saved ? <p role="status" className="mt-3 text-[13px] text-love">Services saved.</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="mt-4 min-h-11 rounded-lg bg-ink px-5 text-[13px] font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : `Save ${selected.size} service${selected.size === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
