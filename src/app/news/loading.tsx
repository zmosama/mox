/** The News tab's shape while it renders: the heading and a column of stories. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-7 h-8 w-28 rounded-lg bg-surface" />
      <div className="mb-5 h-9 w-48 rounded-full bg-surface" />
      <div className="grid gap-2.5 lg:grid-cols-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-3.5 rounded-[18px] bg-surface p-3">
            <div className="aspect-[4/3] w-[104px] shrink-0 rounded-[12px] bg-card sm:w-[124px]" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-full rounded bg-card" />
              <div className="h-4 w-3/4 rounded bg-card" />
              <div className="h-3 w-24 rounded bg-card" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
