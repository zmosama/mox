import Link from "next/link";
import { STUDIOS, logoUrl } from "@/lib/studios";

export const metadata = { title: "Studios · mox" };

/** The studios worth following, most important first. Each opens its work. */
export default function StudiosPage() {
  return (
    <>
      <h1 className="mb-2 text-[28px] font-bold tracking-tight">Studios</h1>
      <p className="mb-7 text-[14px] text-ink-dim">What each one made — the most popular, the best rated or the newest.</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STUDIOS.map((s) => (
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
    </>
  );
}
