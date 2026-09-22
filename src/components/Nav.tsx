"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Search } from "./Search";
import { cn } from "@/lib/cn";
import type { SessionUser } from "@/lib/auth";

const LINKS = [
  { href: "/", label: "Board" },
  { href: "/new", label: "New" },
  { href: "/universes", label: "Universes" },
] as const;

/**
 * On a phone this keeps only the brand and search — the sections live in the
 * bottom bar, within thumb reach. On wider screens the links come back up here
 * and the bottom bar disappears.
 */
export function Nav({ user }: { user: SessionUser | null }) {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link
          href="/"
          className="shrink-0 transition active:opacity-60 sm:hover:opacity-75"
        >
          {/* The wordmark as it is drawn in the identity, glow and all, rather
              than three letters set in whatever font has loaded. `priority`
              because it is the one image above the fold on every page and a
              header that pops in a frame late is the first thing you notice. */}
          <Image
            src="/wordmark.png"
            alt="mox"
            width={376}
            height={116}
            priority
            className="h-[17px] w-auto"
          />
        </Link>

        <nav className="hidden gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13.5px] font-medium transition whitespace-nowrap",
                path === l.href
                  ? "bg-ink font-semibold text-bg"
                  : "text-ink-dim hover:bg-surface hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
          <Search signedIn={Boolean(user)} />

          {user ? (
            <Link
              href="/admin"
              className="hidden shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink sm:block"
            >
              {user.displayName ?? user.username}
            </Link>
          ) : (
            <Link
              href="/admin/login"
              className="hidden shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink sm:block"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
