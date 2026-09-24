"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { MediaKind } from "@/db/schema";
import { TitleSheet } from "./TitleSheet";

export type UpdateData = {
  kind: "premiere" | "arrival" | "person";
  tmdbId: number;
  mediaKind: MediaKind;
  title: string;
  image: string | null;
  text: string;
  date: string;
};

export type StoryData = {
  url: string;
  source: string;
  lang: "en" | "ar";
  title: string;
  summary: string | null;
  image: string | null;
  publishedAt: number;
  reasons: string[];
};

/** "2h", "yesterday", "3 days" — how old a story is, briefly. */
export function ago(unix: number, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now / 1000 - unix) / 60));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days`;
}

/**
 * The News tab: your updates from mox's own data, stories about what you care
 * for — each saying why it is here — and then the day's headlines.
 */
export function News({
  signedIn,
  updates,
  forYou,
  headlines,
  langs,
}: {
  signedIn: boolean;
  updates: UpdateData[];
  forYou: StoryData[];
  headlines: StoryData[];
  langs: ("en" | "ar")[];
}) {
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);
  const [lang, setLang] = useState<"all" | "en" | "ar">("all");
  const shown = useMemo(
    () => (lang === "all" ? headlines : headlines.filter((s) => s.lang === lang)),
    [headlines, lang],
  );

  return (
    <>
      <h1 className="mb-7 text-[28px] font-bold tracking-tight">News</h1>

      {updates.length ? (
        <section className="mb-10">
          <h2 className="mb-3 text-[20px] font-semibold tracking-tight">Your updates</h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6">
            {updates.map((u) => (
              <button
                key={`${u.kind}-${u.mediaKind}-${u.tmdbId}`}
                type="button"
                onClick={() => setOpen({ tmdbId: u.tmdbId, kind: u.mediaKind })}
                className="group w-[260px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-surface text-start transition hover:bg-card"
              >
                <div className="relative aspect-video bg-card">
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves its own sizes
                    <img src={u.image} alt="" className="size-full object-cover" loading="lazy" />
                  ) : null}
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-semibold text-love-soft">
                    {u.kind === "premiere" ? "Premiere" : u.kind === "arrival" ? "Arrived" : "New"}
                  </span>
                </div>
                <div className="px-3.5 py-3">
                  <div className="truncate text-[14.5px] font-semibold">{u.title}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-ink-dim">{u.text}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {forYou.length ? (
        <section className="mb-10">
          <h2 className="mb-1 text-[20px] font-semibold tracking-tight">For you</h2>
          <p className="mb-4 text-[13px] text-ink-dim">About the shows, films and people you follow, want or loved.</p>
          <Stories stories={forYou} />
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-tight">Headlines</h2>
          {langs.length > 1 ? (
            <div className="flex gap-1 rounded-full bg-surface p-1 text-[12.5px] font-medium">
              {(["all", "en", "ar"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn(
                    "rounded-full px-3 py-1 transition",
                    lang === l ? "bg-white/[0.12] text-ink" : "text-ink-dim hover:text-ink",
                  )}
                >
                  {l === "all" ? "All" : l === "en" ? "English" : "عربي"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {shown.length ? (
          <Stories stories={shown} />
        ) : (
          <p className="text-[14px] text-ink-dim">Nothing new from the newsrooms yet today.</p>
        )}
        {!signedIn ? (
          <p className="mt-6 text-[13px] text-ink-faint">
            Sign in and the stories about what you follow and love come first, with your own updates above them.
          </p>
        ) : null}
      </section>

      {open ? (
        <TitleSheet tmdbId={open.tmdbId} kind={open.kind} signedIn={signedIn} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function Stories({ stories }: { stories: StoryData[] }) {
  return (
    <ul className="grid gap-2.5 lg:grid-cols-2">
      {stories.map((s) => (
        <li key={s.url}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            dir={s.lang === "ar" ? "rtl" : "ltr"}
            className="flex gap-3.5 rounded-[18px] bg-surface p-3 transition hover:bg-card"
          >
            <div className="aspect-[4/3] w-[104px] shrink-0 overflow-hidden rounded-[12px] bg-card sm:w-[124px]">
              {s.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- the newsroom's own picture
                <img src={s.image} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-3 text-[14.5px] font-semibold leading-snug">{s.title}</div>
              <div className="mt-1.5 text-[12px] text-ink-faint" suppressHydrationWarning>
                {s.source} · {ago(s.publishedAt)}
              </div>
              {s.reasons.length ? (
                <div className="mt-1.5 truncate text-[12px] font-medium text-love-soft" dir="ltr">
                  {s.reasons[0]}
                </div>
              ) : null}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
