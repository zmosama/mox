/** Posters in columns that fill the width, sized for a thumb on a phone. */
export function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
      {children}
    </div>
  );
}
