/**
 * Shown the instant a link is tapped, while the page renders on the server.
 *
 * Its real job is speed: with a loading boundary, Next prefetches every
 * dynamic page up to here as its link scrolls into view, so a tap switches
 * screens at once instead of waiting for the server's answer first.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-7 h-8 w-40 rounded-lg bg-surface" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="aspect-[2/3] rounded-card bg-surface" />
        ))}
      </div>
    </div>
  );
}
