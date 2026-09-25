"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Notify = { episodes: boolean; watchlist: boolean; f1: boolean; episodesAt: number; f1Lead: number };

type State = "unsupported" | "needs-home-screen" | "denied" | "off" | "on";

const toKey = (base64: string) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches;

/**
 * Notifications in this browser: new episodes of shows you follow, watchlist
 * arrivals, F1 sessions. The server sends them, to every browser the account
 * turned them on in. On an iPhone a website can only receive them once it has
 * been added to the home screen — Apple's rule — so that is what it says.
 */
export function WebNotifications({ initial }: { initial: Notify }) {
  const [notify, setNotify] = useState(initial);
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIOS() && !standalone() ? "needs-home-screen" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    };
    void check();
  }, []);

  const savePrefs = async (next: Notify) => {
    setNotify(next);
    await fetch("/api/account/prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notify: next }),
    });
  };

  /** Ask the browser, subscribe it, and tell the server where to send. */
  const turnOn = async () => {
    setMessage(null);
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "denied" : "off");
      return false;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const { publicKey } = (await (await fetch("/api/push/subscribe")).json()) as { publicKey: string };
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) {
      setMessage("Couldn't turn them on — try again.");
      return false;
    }
    setState("on");
    return true;
  };

  const turnOff = async () => {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setState("off");
  };

  /** A switch: turning the first one on subscribes this browser first. */
  const toggle = async (k: "episodes" | "watchlist" | "f1") => {
    const next = { ...notify, [k]: !notify[k] };
    if (next[k] && state !== "on" && !(await turnOn())) return;
    await savePrefs(next);
  };

  const test = async () => {
    setMessage(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { delivered?: number; error?: string };
    setMessage(res.ok ? (body.delivered ? "Sent — it should appear in a moment." : "No browser is subscribed yet.") : body.error ?? "Couldn't send.");
  };

  const time = `${String(Math.floor(notify.episodesAt / 60)).padStart(2, "0")}:${String(notify.episodesAt % 60).padStart(2, "0")}`;

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Notifications</h2>
      <p className="mb-3 text-[13px] text-ink-faint">
        In this browser, even with the site closed. The iPhone app has its own switches.
      </p>

      {state === "needs-home-screen" ? (
        <p className="rounded-card border border-line bg-card px-3.5 py-3 text-[13px] text-ink-dim">
          On an iPhone, a website can send notifications only once it&apos;s on the home screen: tap Share, then
          &ldquo;Add to Home Screen&rdquo;, and open mox from there.
        </p>
      ) : state === "unsupported" ? (
        <p className="text-[13px] text-ink-dim">This browser can&apos;t receive notifications.</p>
      ) : state === "denied" ? (
        <p className="text-[13px] text-ink-dim">
          Notifications are blocked for this site in the browser&apos;s settings — allow them there, then come back.
        </p>
      ) : state === null ? null : (
        <div className="flex flex-col gap-2">
          {(
            [
              ["episodes", "New episodes", "Shows you follow, on the day they reach you"],
              ["watchlist", "Watchlist arrivals", "When something you want lands on your services"],
              ["f1", "F1 sessions", "Before qualifying, sprints and races — never a result"],
            ] as const
          ).map(([k, label, hint]) => (
            <label key={k} className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-card px-3.5 py-3">
              <input
                type="checkbox"
                checked={notify[k] && state === "on"}
                onChange={() => void toggle(k)}
                className="mt-0.5 size-4 accent-[var(--color-love)]"
              />
              <span className="flex-1">
                <span className="block text-[14px] font-medium">{label}</span>
                <span className="block text-[12.5px] text-ink-faint">{hint}</span>
              </span>
              {k === "episodes" && notify.episodes ? (
                <input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    if (Number.isFinite(h) && Number.isFinite(m)) void savePrefs({ ...notify, episodesAt: h * 60 + m });
                  }}
                  aria-label="Episodes at (Cairo time)"
                  className="rounded-lg bg-surface px-2 py-1 text-[13px]"
                />
              ) : null}
              {k === "f1" && notify.f1 ? (
                <select
                  value={notify.f1Lead}
                  onChange={(e) => void savePrefs({ ...notify, f1Lead: Number(e.target.value) })}
                  aria-label="Minutes before the start"
                  className="rounded-lg bg-surface px-2 py-1 text-[13px]"
                >
                  {[5, 15, 30, 60].map((m) => (
                    <option key={m} value={m}>{m} min before</option>
                  ))}
                </select>
              ) : null}
            </label>
          ))}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {state === "on" ? (
              <>
                <button type="button" onClick={() => void test()} className="rounded-full bg-surface px-4 py-1.5 text-[13px] font-medium hover:bg-card">
                  Send a test
                </button>
                <button type="button" onClick={() => void turnOff()} className="rounded-full px-3 py-1.5 text-[13px] text-ink-dim hover:text-ink">
                  Turn off in this browser
                </button>
              </>
            ) : null}
            {message ? <span className={cn("text-[12.5px]", "text-ink-dim")}>{message}</span> : null}
          </div>
        </div>
      )}
    </section>
  );
}
