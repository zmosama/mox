import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { readPrefs } from "@/lib/prefs";
import { logoUrl, studiosFor, type Studio } from "@/lib/studios";

export const dynamic = "force-dynamic";

export const metadata = { title: "Studios · mox" };

/** The studios you follow, then the rest, most important first. Each opens its work. */
export default async function StudiosPage() {
  const user = await currentUser();
  const studios = studiosFor(readPrefs(user?.id ?? null).studios);
  const mine = studios.filter((s) => s.following);
  const rest = studios.filter((s) => !s.following);

  return (
    <>
      <h1 className="mb-2 text-[28px] font-bold tracking-tight">Studios</h1>
      <p className="mb-7 text-[14px] text-ink-dim">
        What each one made — the most popular, the best rated or the newest. Follow one and it moves to the top.
      </p>
      {mine.length ? (
        <>
          <h2 className="mb-3 text-[20px] font-semibold tracking-tight">Following</h2>
          <Tiles studios={mine} />
          <h2 className="mb-3 mt-10 text-[20px] font-semibold tracking-tight">All studios</h2>
        </>
      ) : null}
      <Tiles studios={rest} />
    </>
  );
}

function Tiles({ studios }: { studios: Studio[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {studios.map((s) => (
        <li key={s.slug}>
          <Link
            href={`/studios/${s.slug}`}
            className="group flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-love"
          >
            {/* TMDB's logos are mostly dark lines on nothing: a light tile keeps them legible. */}
            <span className="block aspect-[16/9] overflow-hidden rounded-card bg-[#f2f2ee] p-4 transition-transform duration-150 group-hover:scale-[1.03]">
              {/* eslint-disable-next-line @next/next/no-img-element -- TMDB logo */}
              <img src={logoUrl(s.logo)} alt="" className="size-full object-contain" loading="lazy" />
            </span>
            <span className="truncate text-[13px] font-medium">{s.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
