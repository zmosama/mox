"use client";

import { useEffect, useRef } from "react";

type Gis = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    };
  };
};

/**
 * Google's own sign-in button, from Google Identity Services. It hands back an
 * ID token, which the server verifies; there is no redirect and no secret.
 * The script loads only on the sign-in page, and only when Google is set up.
 */
export function GoogleButton({
  clientId,
  onSignedIn,
  onError,
}: {
  clientId: string;
  /** `created`: Google made a brand-new account rather than signing one in. */
  onSignedIn: (created: boolean) => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Held in refs, so a parent re-render does not re-initialise Google's button.
  const done = useRef(onSignedIn);
  const failed = useRef(onError);
  useEffect(() => {
    done.current = onSignedIn;
    failed.current = onError;
  });

  useEffect(() => {
    const render = () => {
      const google = (window as unknown as { google?: Gis }).google;
      if (!google || !box.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          const res = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: credential }),
          });
          const payload = (await res.json().catch(() => null)) as { error?: string; created?: boolean } | null;
          if (res.ok) return done.current(payload?.created === true);
          failed.current(payload?.error ?? "Google sign-in failed");
        },
      });
      /* Nobody sees this one (it sits invisible over ours, below), so only
         its size matters: as wide as Google allows, to take the tap anywhere. */
      google.accounts.id.renderButton(box.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: Math.min(box.current.clientWidth || 320, 400),
      });
    };

    const src = "https://accounts.google.com/gsi/client";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if ((window as unknown as { google?: Gis }).google) render();
      else existing.addEventListener("load", render, { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [clientId]);

  /* Google's button comes in Google's colours: a grey that is neither the
     page's black nor its fields, no border, and words in whatever language
     Google guesses. On this page it looked pasted on. So the button you see
     is ours, drawn like everything else here, and Google's real one lies over
     it, transparent, taking the tap — it has to be theirs that is pressed, or
     Google will not hand back a sign-in. */
  return (
    <div className="group relative mx-auto h-12 w-full max-w-[400px]">
      <div
        aria-hidden
        className="flex h-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface text-[14px] font-semibold text-ink transition group-hover:bg-card group-focus-within:border-like group-active:scale-[0.99]"
      >
        <svg viewBox="0 0 48 48" className="size-[18px]">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.500-4.800 7.200l7.700 6c4.500-4.200 6.900-10.300 6.900-17.700z" />
          <path fill="#FBBC05" d="M10.500 28.600c-.5-1.500-.8-3-.8-4.600s.3-3.100.8-4.600l-7.900-6.200C.9 16.500 0 20.100 0 24s.9 7.500 2.600 10.800l7.900-6.200z" />
          <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-4.900 2.300-8.200 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z" />
        </svg>
        Continue with Google
      </div>
      {/* `color-scheme: light`: on a dark page the browser gives Google's frame
          an opaque white backing, which showed as a white box behind it. */}
      <div
        ref={box}
        className="absolute inset-0 flex origin-center scale-y-[1.2] items-center justify-center overflow-hidden opacity-[0.01] [color-scheme:light]"
      />
    </div>
  );
}
