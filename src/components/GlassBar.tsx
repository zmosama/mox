"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * The floating glass bar, as in the iPhone app: Today, the ring (home), and My
 * List. The ring carries no label — the logo is the name. The same bar on every
 * screen size, so the phone and the desktop are one product.
 */
export function GlassBar() {
  const path = usePathname();
  const home = path === "/";
  const today = path.startsWith("/new");
  const list = path.startsWith("/list");

  return (
    <>
      {/* Content fades to black as it slides under the bar, as on iOS, so a
          card half under it reads as "more below" rather than as clutter. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[45] h-[calc(7rem+env(safe-area-inset-bottom))] bg-gradient-to-b from-transparent via-black/70 to-black"
      />
    <nav
      aria-label="Sections"
      /* Above page content and search results, below the title sheet (z-50). */
      className="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[46] flex justify-center px-4"
    >
      <ul className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.07] p-1.5 shadow-pop backdrop-blur-2xl backdrop-saturate-150">
        <Tab href="/new" active={today} label="Today">
          <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 14.5v-9zM12 6.2l1 2.4 2.5.2-1.9 1.6.6 2.5L12 11.6l-2.2 1.3.6-2.5-1.9-1.6 2.5-.2 1-2.4zM8 20h8v1.5H8z" />
        </Tab>

        <li>
          <Link
            href="/"
            aria-label="MOX"
            aria-current={home ? "page" : undefined}
            className={cn(
              "grid h-12 w-[84px] place-items-center rounded-full transition",
              home ? "bg-white/[0.12]" : "hover:bg-white/[0.06]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset */}
            <img src="/ring-tab.png" alt="" className="size-8" draggable={false} />
          </Link>
        </li>

        <Tab href="/list" active={list} label="My List">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" />
        </Tab>
      </ul>
    </nav>
    </>
  );
}

function Tab({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-12 w-[84px] flex-col items-center justify-center gap-0.5 rounded-full transition",
          active ? "bg-white/[0.12] text-love" : "text-ink hover:bg-white/[0.06]",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-[22px] fill-current" aria-hidden>
          {children}
        </svg>
        <span className="text-[10.5px] font-medium leading-none">{label}</span>
      </Link>
    </li>
  );
}
