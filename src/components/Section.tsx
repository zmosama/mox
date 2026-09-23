/**
 * A titled block.
 *
 * The heading carries a rule and real space above it. Every section used to be
 * the same 16px line with the same gap, so the page read as one long run of
 * near-identical rows with nothing marking where one thing ended.
 */
export function Section({
  title,
  count,
  lede,
  children,
}: {
  title: string;
  count?: number;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 first:mt-0 sm:mb-12">
      {/* The app's section heading: title, then a quiet count beside it. */}
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
        {count !== undefined ? (
          <span className="numeric text-[13px] text-ink-dim">{count}</span>
        ) : null}
      </div>
      {lede ? <p className="-mt-1 mb-4 text-[13px] leading-relaxed text-ink-dim">{lede}</p> : null}
      {children}
    </section>
  );
}
