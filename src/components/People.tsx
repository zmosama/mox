"use client";

import { cn } from "@/lib/cn";

export type PersonChipData = {
  id: number;
  name: string;
  profile: string | null;
  /** The character they played, "Director", or what they are known for. */
  role?: string | null;
};

/** A face, a name and a role — one person in a row of them. */
export function PersonChip({
  person,
  onOpen,
  size = 76,
}: {
  person: PersonChipData;
  onOpen: (p: PersonChipData) => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      aria-label={`Open ${person.name}`}
      className="group flex shrink-0 flex-col items-center gap-1.5 text-center"
      style={{ width: size + 16 }}
    >
      <Face src={person.profile} name={person.name} size={size} />
      <span className="line-clamp-2 text-[12.5px] font-medium leading-tight">{person.name}</span>
      {person.role ? <span className="line-clamp-1 text-[11px] leading-tight text-ink-dim">{person.role}</span> : null}
    </button>
  );
}

/** A round photo, or initials when TMDB has none. */
export function Face({ src, name, size, className }: { src: string | null; name: string; size: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-ink-dim ring-1 ring-white/10 transition group-hover:ring-love/60",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized files
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

/** A titled, sideways-scrolling row of people. */
export function PeopleRow({
  title,
  people,
  onOpen,
  size,
}: {
  title?: string;
  people: PersonChipData[];
  onOpen: (p: PersonChipData) => void;
  size?: number;
}) {
  if (!people.length) return null;
  return (
    <section>
      {title ? <h3 className="mb-3 text-[20px] font-semibold tracking-tight">{title}</h3> : null}
      <div className="strip -me-4 gap-2 pe-4 sm:me-0 sm:pe-0">
        {people.map((p) => (
          <PersonChip key={`${p.id}-${p.role ?? ""}`} person={p} onOpen={onOpen} size={size} />
        ))}
      </div>
    </section>
  );
}
