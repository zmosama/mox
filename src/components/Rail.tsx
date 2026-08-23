/**
 * A row of cards that scrolls sideways instead of wrapping.
 *
 * A wrapping grid put the fourth title of a day on a line of its own, so a
 * day with four looked like a day with three and the rest of the screen went
 * empty. Cards keep a fixed width here so the next one is always half in
 * frame — that overhang is the only thing telling you there is more.
 *
 * It runs off the end of the screen rather than stopping short, because a rail
 * that ends inside the margin reads as a complete row. Only the end bleeds:
 * these sit inside the timeline on the New page, and bleeding the start too
 * would drag the cards across the timeline's rule as they scrolled.
 */
export function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="strip -me-4 snap-x gap-3 pb-1 pe-4 sm:me-0 sm:pe-0">
      {children}
    </div>
  );
}

export function RailItem({ children }: { children: React.ReactNode }) {
  return <div className="w-[124px] snap-start sm:w-[148px]">{children}</div>;
}
