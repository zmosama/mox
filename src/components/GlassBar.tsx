"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Where each tab goes on the website, and how it is drawn. Home's sections use it too. */
/** Sent when Home is pressed on Home itself: Home puts its search away (Home.tsx). */
export const HOME_EVENT = "mox:home";
const backHome = (path: string) => () => {
  if (path === "/") window.dispatchEvent(new Event(HOME_EVENT));
};

export const WEB_TABS: Record<string, { href: string; label: string; icon: string }> = {
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
  studios: {
    href: "/studios",
    label: "Studios",
    // A clapperboard.
    icon: "M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9zm-.6-4.2 14.5-2.6a1 1 0 0 1 1.2.8l.5 2.6L5 8.2a1 1 0 0 1-.8-.8l-.3-1.6a1 1 0 0 1 .8-1.2zM7.2 4.3 9.6 7l2-.4-2.4-2.7-2 .4zm5 -.9 2.4 2.7 2-.4-2.4-2.7-2 .4z",
  },
  friends: {
    href: "/friends",
    label: "Friends",
    // Two people.
    icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7.5-.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.9 0-7 2.2-7 5v2h14v-2c0-2.8-3.1-5-7-5zm7.5-.5c-.8 0-1.6.1-2.3.4 1.4 1.1 2.3 2.5 2.3 4.1v3H22v-2.5c0-2.8-2.5-5-5.5-5z",
  },
  universes: {
    href: "/universes",
    label: "Universes",
    // A planet and its ring.
    icon: "M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm7.6-1.9c1.6.4 2.6 1.1 2.8 2.1.4 1.9-2.6 4.4-7.2 6.2a26 26 0 0 1-8.7 1.9c-2.6 0-4.3-.6-4.7-1.7-.3-1 .4-2.1 1.8-3.2l.4 1.5c-.6.6-.8 1-.7 1.3.2.6 1.6.9 3.7.8a24 24 0 0 0 7.5-1.7c4-1.6 6.3-3.6 6.1-4.7-.1-.4-.6-.8-1.5-1l.5-1.5z",
  },
  airing: {
    href: "/calendar",
    label: "Calendar",
    // A calendar page with its rings and one day marked.
    icon: "M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zM5 9v10h14V9H5zm9 3h3v3h-3v-3z",
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
 * — the logo is the name. That is a phone or a tablet; a computer gets
 * `TopBar` instead.
 */
/** Who is signed in, for the photo beside the bar on a computer. */
type BarUser = { name: string; avatar: string | null } | null;

export function GlassBar({ tabs, user }: { tabs: string[]; user: BarUser }) {
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

  /* A computer: the bar sits at the top, as on the iPad — names, no icons,
     and the screens that are not in your bar under "More". */
  const more = Object.keys(WEB_TABS).filter((id) => !shown.includes(id) && !PINNED.includes(id));

  return (
    <>
      <TopBar path={path} tabs={shown} more={more} user={user} />
      {/* Content fades as it slides under the bar, as on iOS — only just
          behind the bar: a taller, blacker fade dimmed every poster in the
          bottom third of a large screen. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[45] h-[calc(4.5rem+env(safe-area-inset-bottom))] bg-gradient-to-b from-transparent to-black/80 lg:hidden"
      />
    <nav
      aria-label="Sections"
      /* Above page content and search results, below the title sheet (z-50). */
      className="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[46] flex justify-center px-4 lg:hidden"
    >
      <ul className="flex items-center gap-0.5 rounded-full border border-white/10 bg-[#1c1f1e]/95 p-1.5 shadow-pop sm:gap-1">
        {left.map(tab)}

        <li>
          <Link
            href="/"
            aria-label="MOX"
            onClick={backHome(path)}
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

/** Always in the bar on a computer, right after Home, whatever the account's tabs. */
const PINNED = ["airing"];

/** The bar on a computer: one pill at the top, centred. */
function TopBar({ path, tabs, more, user }: { path: string; tabs: string[]; more: string[]; user: BarUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLLIElement>(null);
  const on = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  // The menu shuts on a click anywhere else, on Escape, and on arriving somewhere.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  /** Search lives on Home: go there if need be, then put the cursor in it. */
  const search = () => {
    if (path !== "/") router.push("/");
    let tries = 0;
    const focus = () => {
      const box = document.querySelector<HTMLInputElement>('input[aria-label="Search"]');
      if (box && window.location.pathname === "/") {
        box.focus();
        box.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (tries++ < 40) setTimeout(focus, 50);
    };
    focus();
  };

  const item = "flex h-10 items-center rounded-full px-4 text-[15px] font-medium transition";
  const state = (active: boolean) => (active ? "bg-white/[0.12] text-love" : "text-ink hover:bg-white/[0.06]");

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[45] hidden h-24 bg-gradient-to-t from-transparent to-black/80 lg:block"
      />
      {/* Your photo in the top corner, level with the bar, as on the iPad —
          on every screen, not only Home. On a phone it stays on Home's picture. */}
      <Link
        href={user ? "/admin" : "/admin/login"}
        aria-label={user ? "Account and settings" : "Sign in"}
        className={cn(
          "fixed end-6 top-[18px] z-[46] hidden size-10 place-items-center overflow-hidden rounded-full border-[1.5px] border-love/70 text-[17px] font-semibold shadow-pop transition hover:opacity-85 lg:grid xl:end-10",
          user ? "bg-love-soft text-bg" : "bg-card text-ink",
        )}
      >
        {user?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small, already-sized photo
          <img src={user.avatar} alt="" className="size-full object-cover" />
        ) : user ? (
          user.name.slice(0, 1).toUpperCase()
        ) : (
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.400 0-8 2.500-8 5.500V22h16v-2.500c0-3-3.600-5.500-8-5.500z" />
          </svg>
        )}
      </Link>
      <nav aria-label="Sections" className="fixed inset-x-0 top-3 z-[46] hidden justify-center px-4 lg:flex">
        <ul className="flex items-center gap-0.5 rounded-full border border-white/10 bg-[#1c1f1e]/95 p-1.5 shadow-pop">
          <li>
            <Link href="/" onClick={backHome(path)} aria-current={on("/") ? "page" : undefined} className={cn(item, "gap-2 ps-2.5", state(on("/")))}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset */}
              <img src="/ring-tab.png" alt="" className="size-6" draggable={false} />
              Home
            </Link>
          </li>
          {[...PINNED, ...tabs.filter((id) => !PINNED.includes(id))].map((id) => {
            const t = WEB_TABS[id];
            return (
              <li key={id}>
                <Link href={t.href} aria-current={on(t.href) ? "page" : undefined} className={cn(item, state(on(t.href)))}>
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li ref={menu} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className={cn(item, "gap-1", state(open || more.some((id) => on(WEB_TABS[id].href)) || on("/admin")))}
            >
              More
              <svg viewBox="0 0 24 24" className={cn("size-4 transition", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {open ? (
              <ul
                role="menu"
                className="absolute end-0 top-[calc(100%+0.6rem)] w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#1c1f1e] py-1.5 shadow-pop"
              >
                {more.map((id) => {
                  const t = WEB_TABS[id];
                  return (
                    <li key={id} role="none">
                      <Link
                        role="menuitem"
                        href={t.href}
                        onClick={() => setOpen(false)}
                        className={cn("flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition hover:bg-white/[0.06]", on(t.href) ? "text-love" : "text-ink")}
                      >
                        <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
                          <path d={t.icon} fillRule="evenodd" />
                        </svg>
                        {t.label}
                      </Link>
                    </li>
                  );
                })}
                {more.length ? <li role="none" className="my-1.5 h-px bg-white/10" /> : null}
                <li role="none">
                  <Link
                    role="menuitem"
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className={cn("flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition hover:bg-white/[0.06]", on("/admin") ? "text-love" : "text-ink")}
                  >
                    <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
                      <path d="M12 12a4.500 4.500 0 1 0 0-9 4.500 4.500 0 0 0 0 9zm0 2c-4.400 0-8 2.500-8 5.500V21h16v-1.500c0-3-3.600-5.500-8-5.500z" />
                    </svg>
                    Settings
                  </Link>
                </li>
              </ul>
            ) : null}
          </li>
          <li>
            <button type="button" aria-label="Search" onClick={search} className="grid size-10 place-items-center rounded-full text-ink transition hover:bg-white/[0.06]">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="6.500" />
                <path d="M16 16l4.500 4.500" />
              </svg>
            </button>
          </li>
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
