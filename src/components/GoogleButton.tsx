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
  onSignedIn: () => void;
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
          if (res.ok) return done.current();
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          failed.current(payload?.error ?? "Google sign-in failed");
        },
      });
      google.accounts.id.renderButton(box.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: box.current.clientWidth || 320,
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

  return <div ref={box} className="flex min-h-11 w-full justify-center" />;
}
