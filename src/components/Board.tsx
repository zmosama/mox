"use client";

import Link from "next/link";
import { useState } from "react";
import { EpisodeRow } from "./EpisodeRow";
import { Section } from "./Section";
import { Tabs } from "./Tabs";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";
import { dayLabel } from "@/lib/dates";
import type { CalendarEpisode } from "@/lib/queries";
import type { MediaKind } from "@/db/schema";

type Tab = "mine" | "available" | "all";

const TABS: { id: Tab; label: string; test: (e: CalendarEpisode) => boolean }[] = [
  { id: "mine", label: "Your shows", test: (e) => e.following },
  { id: "available", label: "On services", test: (e) => e.platforms.length > 0 },
  { id: "all", label: "Everything", test: () => true },
];

export function Board({
  today,
  episodes,
  trending,
  signedIn,
  needsServices = false,
}: {
  today: string;
  episodes: CalendarEpisode[];
  trending: CardTitle[];
  signedIn: boolean;
  /** Signed in, but has never said which services they pay for. */
  needsServices?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("mine");
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);

  const onToday = episodes.filter((e) => e.airs === today && e.following);
  const alsoToday = episodes.filter((e) => e.airs === today && !e.following).length;

  const upcoming = episodes.filter((e) => e.airs > today);
  const shown = upcoming.filter(TABS.find((t) => t.id === tab)!.test);

  const byDay = new Map<string, CalendarEpisode[]>();
  for (const e of shown) byDay.set(e.airs, [...(byDay.get(e.airs) ?? []), e]);

  return (
    <>
      {/* Everything is shown until they choose, so this is the only thing
          telling them the filter exists. Without it "on your services"
          silently means "on every service". */}
      {needsServices ? (
        <Link
          href="/admin/services"
          className="mb-6 flex items-center gap-3 rounded-card border border-like/35 bg-like/10 px-4 py-3 text-[13px] transition hover:border-like/60"
        >
          <span aria-hidden className="text-base">📺</span>
          <span className="flex-1 leading-snug">
            <b className="font-semibold">You haven’t picked your services yet.</b>{" "}
            <span className="text-ink-dim">
              Everything is showing. Choose what you subscribe to and this narrows to you.
            </span>
          </span>
          <span aria-hidden className="text-ink-dim">›</span>
        </Link>
      ) : null}

      <Section
        title="On today"
        count={onToday.length}
        lede={
          alsoToday
            ? `${dayLabel(today, today)} · ${alsoToday} more airing today, in the calendar below`
            : dayLabel(today, today)
        }
      >
        {onToday.length ? (
          <div className="rounded-card border border-love/25 bg-gradient-to-br from-[#101b13] to-surface px-4 py-2 shadow-card">
            {onToday.map((e) => (
              <EpisodeRow
                key={`${e.show}-${e.season}-${e.episode}`}
                episode={e}
                prominent
                onOpen={setOpen}
              />
            ))}
          </div>
        ) : (
          <Empty>
            Nothing from your shows today
            {alsoToday ? ` · ${alsoToday} other episodes in the calendar` : ""}
          </Empty>
        )}
      </Section>

      <Section
        title="Calendar"
        count={shown.length}
        lede={
          tab === "mine"
            ? signedIn
              ? "Only shows you follow — open “On services” and tap ☆ to add one."
              : "Sign in to follow shows and build your calendar."
            : signedIn
              ? "Tap ☆ on a show to add it to Your shows."
              : "Availability across the services tracked by this install."
        }
      >
        <Tabs
          className="mb-3"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={TABS.map((t) => [t.id, t.label])}
        />

        {byDay.size ? (
          <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            {[...byDay].map(([airs, list]) => (
              <div key={airs}>
                <div className="border-y border-line bg-surface px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-ink-dim first:border-t-0">
                  {dayLabel(airs, today)}
                </div>
                {list.map((e) => (
                  <EpisodeRow
                    key={`${e.show}-${e.season}-${e.episode}`}
                    episode={e}
                        signedIn={signedIn}
                    onOpen={setOpen}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <Empty>
            {tab === "mine"
              ? "You’re not following anything yet — open “On services” and tap ☆."
              : "Nothing here"}
          </Empty>
        )}
      </Section>

      <Section
        title="Trending now"
        count={trending.length}
        lede={
          signedIn
            ? "Popular this week and on a service you have"
            : "Popular this week on services tracked by mox"
        }
      >
        {trending.length ? (
          <Grid>
            {trending.slice(0, 18).map((t) => (
              <TitleCard
                key={`${t.tmdbId}-${t.kind}`}
                item={t}
                onOpen={(i) => setOpen({ tmdbId: i.tmdbId, kind: i.kind })}
              />
            ))}
          </Grid>
        ) : (
          <Empty>
            {signedIn
              ? "Nothing trending on your services right now"
              : "Nothing trending on tracked services right now"}
          </Empty>
        )}
      </Section>

      {open ? (
        <TitleSheet
          tmdbId={open.tmdbId}
          kind={open.kind}
          signedIn={signedIn}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-card px-6 py-6 text-center text-[13.5px] text-ink-faint">
      {children}
    </div>
  );
}
