/** A title's shape while it renders: the picture, the name, the buttons, the story. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="-mx-4 aspect-video bg-surface sm:-mx-6 sm:rounded-[24px] lg:mx-0" />
      <div className="mt-5 h-8 w-3/5 rounded-lg bg-surface" />
      <div className="mt-2.5 h-4 w-40 rounded bg-surface" />
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
  );
}
