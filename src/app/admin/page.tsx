import Link from "next/link";
import { redirect } from "next/navigation";
import { avatarUrl, currentUser } from "@/lib/auth";
import { ProfilePhoto } from "@/components/ProfilePhoto";
import { stats, tasteFor } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  const s = stats(user.id);
  const taste = tasteFor(user.id);
  const traits = taste?.strongest("keyword", 4, 8) ?? [];
  const people = taste?.strongest("person", 4, 6) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <ProfilePhoto name={user.displayName ?? user.username} avatar={avatarUrl(user)} />

      <section>
        <h2 className="mb-3 text-base font-semibold">Your ratings</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rated" value={`${s.rated} / ${s.total}`} />
          <Stat label="Loved" value={s.counts.love ?? 0} tone="text-love" />
          <Stat label="Liked" value={s.counts.like ?? 0} tone="text-like" />
          <Stat label="Not for me" value={s.counts.dislike ?? 0} tone="text-against" />
          <Stat label="Want to watch" value={s.counts.watchlist ?? 0} tone="text-want" />
          <Stat label="Hidden" value={s.counts.hidden ?? 0} />
        </div>
        <Link
          href="/admin/rate"
          className="mt-3 inline-block rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-bg transition hover:opacity-90"
        >
          Rate more
        </Link>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">What marks your taste</h2>
        <p className="mb-3 text-[13px] text-ink-faint">
          Measured against your own average, so a trait shared by everything you watch counts
          for nothing.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {traits.map((t) => (
            <Chip key={t.value} label={t.value} n={t.seen} />
          ))}
        </div>
        {people.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {people.map((p) => (
              <Chip key={p.value} label={p.value} n={p.seen} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-card border border-line bg-card px-3.5 py-3">
      <div className={`numeric text-xl font-bold ${tone ?? ""}`}>{value}</div>
      <div className="mt-0.5 text-[11.5px] text-ink-faint">{label}</div>
    </div>
  );
}

function Chip({ label, n }: { label: string; n: number }) {
  return (
    <span className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink-dim">
      {label} <span className="numeric text-ink-faint">×{n}</span>
    </span>
  );
}
