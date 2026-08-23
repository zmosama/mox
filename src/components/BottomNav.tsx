"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { SessionUser } from "@/lib/auth";

/**
 * Phone navigation. Links along the top of a phone are a stretch for a thumb
 * and get squeezed by the logo and search, so on small screens they move to a
 * bar at the bottom and the header keeps only the brand and search.
 */
const TABS = [
  {
    href: "/",
    label: "Board",
    icon: (
      <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm9 0h7v-9h-7v9zm0-16v5h7V4h-7z" />
    ),
  },
  {
    href: "/new",
    label: "New",
    icon: (
      <path d="M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7.1L22 9.2l-7.2-.6L12 2z" />
    ),
  },
  {
    href: "/universes",
    label: "Universes",
    icon: (
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.2c1.2 1.5 2 3.8 2.1 6.3H9.9c.1-2.5.9-4.8 2.1-6.3zM7.9 11.5c.1-2.3.7-4.4 1.7-6a8.1 8.1 0 0 0-4.7 6h3zm0 1H4.9a8.1 8.1 0 0 0 4.7 6c-1-1.6-1.6-3.7-1.7-6zm2 0h4.2c-.1 2.5-.9 4.8-2.1 6.3-1.2-1.5-2-3.8-2.1-6.3zm6.2 0h3a8.1 8.1 0 0 1-4.7 6c1-1.6 1.6-3.7 1.7-6zm0-1c-.1-2.3-.7-4.4-1.7-6a8.1 8.1 0 0 1 4.7 6h-3z" />
    ),
  },
] as const;

export function BottomNav({ user }: { user: SessionUser | null }) {
  const path = usePathname();

  const tabs = [
    ...TABS,
    user
      ? {
          href: "/admin",
          label: "You",
          icon: (
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.5-8 5.5V22h16v-2.5c0-3-3.6-5.5-8-5.5z" />
          ),
        }
      : {
          href: "/admin/login",
          label: "Sign in",
          icon: (
            <path d="M10 17l5-5-5-5v3H3v4h7v3zm9-14H12v2h7v14h-7v2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
          ),
        },
  ];

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
    >
      <ul className="flex">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                /* 56px tall: comfortably above the 44px minimum touch target. */
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 transition",
                  active ? "text-love" : "text-ink-faint active:text-ink",
                )}
              >
                <svg viewBox="0 0 24 24" className="size-[22px] fill-current" aria-hidden>
                  {t.icon}
                </svg>
                <span className="text-[10.5px] font-semibold leading-none">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
