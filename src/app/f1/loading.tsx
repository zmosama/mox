/** Formula 1's shape while it renders: the next race, then the standings. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-7 h-8 w-36 rounded-lg bg-surface" />
      <div className="h-48 rounded-[24px] bg-surface" />
      <div className="mt-8 space-y-2.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-14 rounded-[16px] bg-surface" />
        ))}
      </div>
    </div>
  );
}
