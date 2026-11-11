/**
 * What stands in while something loads: the outline of what is coming where
 * its shape is known, and the MOX mark pulsing where it is not (the next page
 * of a list, a search under way). No turning wheels.
 */

/** The MOX mark, breathing. */
export function MoxPulse({ size = 28, label = "Loading" }: { size?: number; label?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 2 KB mark, already cached by the tab bar
    <img
      src="/ring-tab.png"
      alt={label}
      width={size}
      height={size}
      draggable={false}
      className="mox-pulse shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

/** The outline of a title or a person, inside a sheet that has opened ahead of its answer. */
export function SheetSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-5 px-5 pb-10 pt-5">
      <div className="flex justify-center py-2">
        <MoxPulse size={36} />
      </div>
      <div className="animate-pulse">
        <div className="h-3.5 w-24 rounded bg-surface" />
        <div className="mt-2.5 h-[54px] rounded-2xl bg-surface" />
        <div className="mt-5 flex gap-2.5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-10 w-28 rounded-full bg-surface" />
          ))}
        </div>
        <div className="mt-6 space-y-2">
          <div className="h-4 w-full rounded bg-surface" />
          <div className="h-4 w-11/12 rounded bg-surface" />
          <div className="h-4 w-4/5 rounded bg-surface" />
        </div>
      </div>
    </div>
  );
}
