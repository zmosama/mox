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
      <div className="mb-3 flex items-center gap-2.5">
        <span aria-hidden className="h-[18px] w-[3px] rounded-full bg-love" />
        <h2 className="text-[19px] font-bold tracking-tight sm:text-[21px]">{title}</h2>
        {count !== undefined ? (
          <span className="numeric rounded-full bg-raised px-2 py-0.5 text-[11px] font-bold text-ink-dim">
            {count}
          </span>
        ) : null}
      </div>
      {lede ? <p className="-mt-1 mb-4 text-[13px] leading-relaxed text-ink-dim">{lede}</p> : null}
      {children}
    </section>
  );
}
