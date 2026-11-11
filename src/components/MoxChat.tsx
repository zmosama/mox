"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { MediaKind } from "@/db/schema";
import { LivingRing } from "./LivingRing";
import { TitleCard, type CardTitle } from "./TitleCard";
import { TitleSheet } from "./TitleSheet";

type Line = { id: number; role: "user" | "assistant"; text: string; titles?: CardTitle[] };
type Memory = { id: number; text: string; source: "chat" | "told"; createdAt: number };
type Event = { t: "status"; v: string } | { t: "text"; v: string } | { t: "titles"; v: CardTitle[] } | { t: "done" } | { t: "error"; v: string };

/** **bold**, and lines starting "- " or "1. " as a list — all MOX's replies use. Text only: nothing is parsed as HTML. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="my-1.5 list-disc space-y-1 ps-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const item = raw.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (raw.trim()) blocks.push(<p key={`p${blocks.length}`} className="my-1.5">{inline(raw)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

const STARTERS = [
  "What should I watch tonight?",
  "عايز حاجة زي آخر حاجة حبيتها",
  "What's new on my services this week?",
  "إيه آخر أخبار الفورمولا ١؟",
];

/** Talking with MOX: the ring, the conversation, and — below — what MOX knows and how it talks. */
export function MoxChat({
  name,
  connected,
  initialLines,
  initialMemories,
  soul,
  defaultSoul,
  chatModel,
  models,
}: {
  name: string;
  connected: boolean;
  initialLines: Line[];
  initialMemories: Memory[];
  soul: string;
  defaultSoul: string;
  chatModel: string;
  models: { id: string; label: string }[];
}) {
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ tmdbId: number; kind: MediaKind } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  // Follow the reply as it is written, and the posters when they come — but only if he is already at the bottom.
  const last = lines.at(-1);
  const following = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      // Near the end of the conversation — not of the page, which goes on below it.
      const at = end.current?.getBoundingClientRect().top ?? 0;
      following.current = at <= window.innerHeight + 200;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (following.current) end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, last?.text, last?.titles?.length]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setError(null);
    setBusy(true);
    setStatus("Thinking");
    const mine: Line = { id: -Date.now(), role: "user", text: message };
    const reply: Line = { id: -Date.now() - 1, role: "assistant", text: "" };
    setLines((l) => [...l, mine, reply]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/api/mox/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "MOX didn't answer");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const parts = buffered.split("\n");
        buffered = parts.pop() ?? "";
        for (const part of parts) {
          if (!part) continue;
          const event = JSON.parse(part) as Event;
          if (event.t === "text") {
            setStatus(null);
            setLines((l) => l.map((x) => (x.id === reply.id ? { ...x, text: x.text + event.v } : x)));
          } else if (event.t === "titles") {
            const titles = event.v;
            setLines((l) => l.map((x) => (x.id === reply.id ? { ...x, titles } : x)));
          } else if (event.t === "status") setStatus(event.v);
          else if (event.t === "error") setError(event.v);
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      setBusy(false);
      setStatus(null);
      // A reply that never came leaves no empty bubble behind.
      setLines((l) => l.filter((x) => x.id !== reply.id || x.text.trim() || x.titles?.length));
    }
  };

  const startOver = async () => {
    if (busy) return;
    await fetch("/api/mox/chat", { method: "DELETE" });
    setLines([]);
  };

  const empty = lines.length === 0;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col">
      <section className={cn("flex flex-col items-center text-center", empty ? "pt-10" : "pt-2")}>
        <LivingRing size={empty ? 168 : 64} charged={busy} />
        {empty ? (
          <>
            <h1 className="mt-2 text-[28px] font-medium tracking-tight">Hi {name.split(" ")[0]}, I&apos;m MOX</h1>
            <p className="mt-2 max-w-md text-[15px] text-ink/70">
              I know your ratings, your list and your services. Ask me what to watch — in Arabic or English — and tell me what you like; I remember.
            </p>
          </>
        ) : (
          <div className="mt-1 flex items-center gap-3 text-[12.5px] text-ink-dim">
            <span>MOX{status ? ` · ${status}…` : busy ? " · Writing…" : ""}</span>
            {!busy ? (
              <button type="button" onClick={startOver} className="rounded-full px-2 py-0.5 text-ink-faint transition hover:text-ink">
                Start over
              </button>
            ) : null}
          </div>
        )}
      </section>

      {!connected ? (
        <p className="mx-auto mt-6 max-w-md rounded-[16px] bg-surface p-4 text-center text-[14px] text-ink-dim">
          No model is connected yet: the server needs its <code>ANTHROPIC_API_KEY</code>.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {lines.map((l) => (
          <Fragment key={l.id}>
            {l.role === "assistant" && !l.text && (l.titles?.length || !busy || l !== lines.at(-1)) ? null : (
            <div
              dir="auto"
              className={cn(
                "max-w-[88%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed",
                l.role === "user" ? "self-end bg-love/90 text-bg" : "self-start bg-surface text-ink [&_p]:whitespace-pre-wrap",
              )}
            >
              {l.role === "assistant" ? (l.text ? <Rich text={l.text} /> : <span className="text-ink-dim">…</span>) : l.text}
            </div>
            )}
            {/* What it named, as posters: a tap opens the title, as anywhere in MOX. */}
            {l.titles?.length ? (
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6">
                {l.titles.map((t) => (
                  <TitleCard
                    key={`${t.kind}-${t.tmdbId}`}
                    item={t}
                    onOpen={(c) => setOpen({ tmdbId: c.tmdbId, kind: c.kind })}
                    className="w-[112px] shrink-0 snap-start sm:w-[128px]"
                  />
                ))}
              </div>
            ) : null}
          </Fragment>
        ))}
        {error ? <p className="self-start text-[13px] text-against">{error}</p> : null}
        {/* Clear of the field and the tab bar floating over the bottom of the screen. */}
        <div ref={end} className="scroll-mb-[11rem]" />
      </div>

      {empty && connected ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {STARTERS.map((s) => (
            <button key={s} type="button" dir="auto" onClick={() => send(s)} className="rounded-full bg-card/70 px-3.5 py-2 text-[13.5px] text-ink transition hover:bg-raised">
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 z-20 mt-5 flex h-14 items-center gap-2 rounded-full border border-white/10 bg-[#1c1f1e]/95 ps-5 pe-2 shadow-pop"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          dir="auto"
          placeholder={connected ? "Ask MOX…  ·  اسأل موكس…" : "MOX isn't connected yet"}
          disabled={!connected}
          aria-label="Message MOX"
          enterKeyHint="send"
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-dim"
        />
        <button
          type="submit"
          disabled={!connected || busy || !draft.trim()}
          aria-label="Send"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-love text-bg transition disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden><path d="M4 12l15-8-5 16-3-6-7-2z" /></svg>
        </button>
      </form>

      {open ? <TitleSheet tmdbId={open.tmdbId} kind={open.kind} signedIn onClose={() => setOpen(null)} /> : null}

      <MoxMind initialMemories={initialMemories} soul={soul} defaultSoul={defaultSoul} chatModel={chatModel} models={models} />
    </div>
  );
}

/** What MOX remembers, how it talks, and which model it thinks with — all his to read and change. */
function MoxMind({ initialMemories, soul, defaultSoul, chatModel, models }: {
  initialMemories: Memory[];
  soul: string;
  defaultSoul: string;
  chatModel: string;
  models: { id: string; label: string }[];
}) {
  const [memories, setMemories] = useState(initialMemories);
  const [told, setTold] = useState("");
  const [soulText, setSoulText] = useState(soul);
  const [model, setModel] = useState(chatModel);
  const [saved, setSaved] = useState<string | null>(null);

  const forget = async (id: number) => {
    const before = memories;
    setMemories((m) => m.filter((x) => x.id !== id));
    const res = await fetch(`/api/mox/memories?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setMemories(before);
  };
  const tell = async () => {
    if (told.trim().length < 3) return;
    const res = await fetch("/api/mox/memories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: told }) });
    if (res.ok) {
      setMemories(((await res.json()) as { memories: Memory[] }).memories);
      setTold("");
    }
  };
  const save = async (patch: { soul?: string | null; chatModel?: string }, what: string) => {
    const res = await fetch("/api/mox/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setSaved(res.ok ? what : "Couldn't save");
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <div className="mt-14 flex flex-col gap-10 border-t border-line pt-8">
      <section>
        <h2 className="mb-1 text-base font-semibold">What MOX knows about you</h2>
        <p className="mb-3 text-[13px] text-ink-faint">
          Learned from your conversations, or told. Your ratings and list it reads as they are, so they aren&apos;t copied here. Remove anything that&apos;s wrong.
        </p>
        {memories.length ? (
          <ul className="flex flex-col gap-1.5">
            {memories.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-[14px] bg-surface px-3.5 py-2.5 text-[14px]">
                <span className="flex-1" dir="auto">{m.text}</span>
                <span className="shrink-0 pt-0.5 text-[11.5px] text-ink-faint">{m.source === "told" ? "you told it" : "learned"}</span>
                <button type="button" onClick={() => forget(m.id)} aria-label="Forget this" className="shrink-0 text-ink-faint transition hover:text-against">×</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-dim">Nothing yet. Talk to it, or tell it something below.</p>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={told}
            onChange={(e) => setTold(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void tell()}
            dir="auto"
            placeholder="Tell MOX something about you…"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-[14px] outline-none focus:border-line-strong"
          />
          <button type="button" onClick={tell} className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-bg">Remember</button>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">How MOX talks</h2>
        <p className="mb-3 text-[13px] text-ink-faint">Its soul: its temper, its humour, how blunt it is. Leave it empty for MOX&apos;s own.</p>
        <textarea
          value={soulText}
          onChange={(e) => setSoulText(e.target.value)}
          dir="auto"
          rows={4}
          placeholder={defaultSoul}
          className="w-full rounded-[16px] border border-line bg-surface p-3.5 text-[14px] leading-relaxed outline-none focus:border-line-strong"
        />
        <button type="button" onClick={() => save({ soul: soulText || null }, "Soul saved")} className="mt-2 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-bg">
          Save
        </button>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">The model MOX thinks with</h2>
        <p className="mb-3 text-[13px] text-ink-faint">Its memory and soul stay MOX&apos;s whichever you pick. Translating the news always uses the fastest.</p>
        <div className="flex flex-col gap-1.5">
          {models.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-[14px] bg-surface px-3.5 py-2.5 text-[14px]">
              <input
                type="radio"
                name="model"
                checked={model === m.id}
                onChange={() => {
                  setModel(m.id);
                  void save({ chatModel: m.id }, "Model saved");
                }}
              />
              {m.label}
            </label>
          ))}
        </div>
      </section>
      {saved ? <p className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-bg">{saved}</p> : null}
    </div>
  );
}
