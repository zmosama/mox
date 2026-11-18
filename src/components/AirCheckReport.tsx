import type { AirCheck } from "@/lib/air-check-store";
import { isAlarm, type Finding } from "@/lib/air-check";
import { dayLabel, episodeCode, todayISO } from "@/lib/dates";

const LABEL: Record<Finding["kind"], string> = {
  early: "MOX is early",
  early_notice: "Notified early",
  missing: "Not on MOX",
  late: "MOX is late",
  spread: "Season at once",
  unverified: "No reference",
};

/**
 * The owner's nightly second opinion on episode dates: what MOX says for the
 * series he follows, held against pogdesign. Shown as found — it changes no
 * date, and "could not check" is said as plainly as "all match".
 */
export function AirCheckReport({ check }: { check: AirCheck | null }) {
  const today = todayISO();
  // What needs him first; "no reference" last, it is the least to act on.
  const order: Finding["kind"][] = ["early", "early_notice", "missing", "late", "spread", "unverified"];
  const findings = [...(check?.findings ?? [])].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <section id="air-check">
      <h2 className="mb-1 text-base font-semibold">Episode dates, checked</h2>
      <p className="mb-3 text-[13px] text-ink-faint">
        Every night the dates of the series you follow are held against pogdesign&apos;s TV Calendar for the week ahead. Nothing is
        changed for you: this is what differed.
      </p>
      {!check ? (
        <p className="text-[13px] text-ink-dim">Not run yet. The first check is tonight.</p>
      ) : (
        <div className="rounded-card border border-line bg-card p-4">
          <p dir="rtl" className="text-[14px] leading-relaxed text-ink">{check.summaryAr}</p>
          <p className="mt-2 text-[11.5px] text-ink-faint">
            {dayLabel(check.day, today)}
            {check.status === "ok" ? ` · ${check.agreed} of ${check.checked} compared episodes match` : " · pogdesign could not be read, so nothing is known for this night"}
          </p>
          {findings.length ? (
            <ul className="mt-3 flex flex-col">
              {findings.map((f) => (
                <li key={`${f.tmdbId}:${f.season}:${f.episode}:${f.kind}`} className="border-t border-line py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${isAlarm(f) ? "text-love" : "text-ink-faint"}`}>{LABEL[f.kind]}</span>
                    <span className="text-[13.5px] font-medium text-ink">
                      {f.show} <span className="numeric text-ink-dim">{episodeCode(f.season, f.episode)}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink-dim">
                    {f.mine ? `MOX: ${dayLabel(f.mine, today)}` : "MOX: not listed"}
                    {f.theirs ? ` · pogdesign: ${dayLabel(f.theirs, today)}${f.theirsAt ? "" : f.network ? " (official day, no hour)" : " (about)"}` : ""}
                    {f.network ? ` · ${f.network}` : ""}
                  </div>
                  {f.noteAr ? <p dir="rtl" className="mt-1 text-[13px] leading-relaxed text-ink/85">{f.noteAr}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
