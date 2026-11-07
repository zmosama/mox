import type { VitalRow } from "@/lib/vitals";

const UNIT: Record<string, (v: number) => string> = {
  LCP: (v) => `${(v / 1000).toFixed(1)}s`,
  FCP: (v) => `${(v / 1000).toFixed(1)}s`,
  TTFB: (v) => `${Math.round(v)}ms`,
  INP: (v) => `${Math.round(v)}ms`,
  CLS: (v) => v.toFixed(2),
};
/* Google's "good" lines for each. */
const GOOD: Record<string, number> = { LCP: 2500, FCP: 1800, TTFB: 800, INP: 200, CLS: 0.1 };
const NAMES = ["LCP", "INP", "CLS", "TTFB"];

/** The owner's view of real-user speed: each page's 75th percentile this week. */
export function SpeedReport({ rows }: { rows: VitalRow[] }) {
  const pages = [...new Set(rows.map((r) => r.path))].slice(0, 12);
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Speed on real phones</h2>
      <p className="mb-3 text-[13px] text-ink-faint">
        What people&apos;s browsers measured this week, at the 75th percentile. Green is within Google&apos;s line for fast.
      </p>
      {pages.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-start text-ink-faint">
                <th className="py-1.5 pe-3 text-start font-medium">Page</th>
                {NAMES.map((n) => (
                  <th key={n} className="px-2 py-1.5 text-end font-medium">{n}</th>
                ))}
                <th className="ps-2 py-1.5 text-end font-medium">Visits</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((path) => (
                <tr key={path} className="border-t border-line">
                  <td className="py-1.5 pe-3 font-mono text-[12px]">{path}</td>
                  {NAMES.map((n) => {
                    const r = rows.find((x) => x.path === path && x.name === n);
                    return (
                      <td key={n} className={`numeric px-2 py-1.5 text-end ${r ? (r.p75 <= GOOD[n] ? "text-like" : "text-against") : "text-ink-faint"}`}>
                        {r ? UNIT[n](r.p75) : "—"}
                      </td>
                    );
                  })}
                  <td className="numeric ps-2 py-1.5 text-end text-ink-faint">{rows.find((x) => x.path === path && x.name === "TTFB")?.n ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-ink-dim">No visits measured yet.</p>
      )}
    </section>
  );
}
