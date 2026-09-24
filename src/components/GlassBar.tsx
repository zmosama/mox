"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Where each tab goes on the website, and how it is drawn. */
const WEB_TABS: Record<string, { href: string; label: string; icon: string }> = {
  today: {
    href: "/new",
    label: "Today",
    icon: "M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 14.5v-9zM12 6.2l1 2.4 2.5.2-1.9 1.6.6 2.5L12 11.6l-2.2 1.3.6-2.5-1.9-1.6 2.5-.2 1-2.4zM8 20h8v1.5H8z",
  },
  news: {
    href: "/news",
    label: "News",
    icon: "M4 4h13a1 1 0 0 1 1 1v2h2a1 1 0 0 1 1 1v10.5A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5V5a1 1 0 0 1 1-1zm14 5v9.5a.5.5 0 0 0 1 0V9h-1zM6 7v4h5V7H6zm7 0v1.5h3V7h-3zm0 2.5V11h3V9.5h-3zM6 13v1.5h10V13H6zm0 3v1.5h10V16H6z",
  },
  library: {
    href: "/list",
    label: "My List",
    icon: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z",
  },
  f1: {
    href: "/f1",
    label: "F1",
    // A chequered flag on its pole.
    icon: "M4 2h1.6v20H4V2zm2.4 1H20v11H6.4V3zm0 0v2.75h3.4V3H6.4zm6.8 0v2.75h3.4V3h-3.4zM9.8 5.75V8.5h3.4V5.75H9.8zm6.8 0V8.5H20V5.75h-3.4zM6.4 8.5v2.75h3.4V8.5H6.4zm6.8 0v2.75h3.4V8.5h-3.4zm-3.4 2.75V14h3.4v-2.75H9.8zm6.8 0V14H20v-2.75h-3.4z",
  },
};

/**
 * The floating glass bar, as in the iPhone app: your tabs either side of the
 * ring, which is home and never moves. Which tabs, and in what order, is the
 * account's choice (Settings), shared with the app. The ring carries no label
 * — the logo is the name. The same bar on every screen size.
 */
export function GlassBar({ tabs }: { tabs: string[] }) {
  const path = usePathname();
  const home = path === "/";
  const shown = tabs.filter((id) => WEB_TABS[id]);
  const left = shown.slice(0, Math.ceil(shown.length / 2));
  const right = shown.slice(Math.ceil(shown.length / 2));
  const tab = (id: string) => {
    const t = WEB_TABS[id];
    return (
      <Tab key={id} href={t.href} active={path === t.href || path.startsWith(`${t.href}/`)} label={t.label}>
        <path d={t.icon} fillRule="evenodd" />
      </Tab>
    );
  };

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
      <ul className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.07] p-1.5 shadow-pop backdrop-blur-2xl backdrop-saturate-150 sm:gap-1">
        {left.map(tab)}

        <li>
          <Link
            href="/"
            aria-label="MOX"
            aria-current={home ? "page" : undefined}
            className={cn(
              "grid h-12 w-[68px] place-items-center rounded-full transition sm:w-[84px]",
              home ? "bg-white/[0.12]" : "hover:bg-white/[0.06]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset */}
            <img src="/ring-tab.png" alt="" className="size-8" draggable={false} />
          </Link>
        </li>

        {right.map(tab)}
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
          "flex h-12 w-[62px] flex-col items-center justify-center gap-0.5 rounded-full transition sm:w-[84px]",
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
