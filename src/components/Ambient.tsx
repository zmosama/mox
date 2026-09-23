"use client";

import { useEffect, useRef } from "react";
import type { Engine } from "./engine";
import { cn } from "@/lib/cn";

/**
 * The wide light behind the ring, filling the first screen. The ring itself is
 * LivingRing's canvas.
 *
 * Sized to the page, not to the ring — tied to the ring it sat as a spotlight
 * in the middle of a desktop screen — and fades out toward the bottom, where
 * the board begins. It rises and falls with the ring's energy (LivingRing's
 * --mox-energy). At this strength a gradient spans a dozen 8-bit steps; a
 * one-step triangular dither per pixel turns the rings those steps would make
 * into grain too fine to see.
 *
 * Two builds (see engine.ts):
 *  - other: one canvas over the ring, added with `plus-lighter`, its opacity
 *    following the energy.
 *  - safari: Safari drew that blend as a box, so the canvas lies plainly under
 *    the ring, with a steady share of the light, and a second, transparent
 *    canvas above it carries the part that pulses.
 */
export function Ambient({
  ring,
  ringSize,
  height,
  light,
  engine,
}: {
  /** Where the ring sits; the light is centred on it. */
  ring: React.RefObject<HTMLElement | null>;
  ringSize: number;
  /** How far down the light may reach before it has faded out (CSS length). */
  height: string;
  /** Off while asking. */
  light: boolean;
  engine: Engine;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pulse = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (engine === "unknown") return;
    const safari = engine === "safari";
    let timer = 0;
    let frame = 0;
    let live = true;

    const paint = () => {
      const el = canvas.current;
      const target = ring.current;
      const ctx = el?.getContext("2d");
      if (!live || !el || !target || !ctx) return;

      const box = el.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2 - box.left;
      const cy = r.top + r.height / 2 - box.top;

      // Full resolution up to ~4 million pixels, which a big desktop exceeds.
      const budget = 4e6;
      const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(budget / (box.width * box.height)));
      const w = Math.max(1, Math.round(box.width * scale));
      const h = Math.max(1, Math.round(box.height * scale));
      el.width = w;
      el.height = h;

      const hole = (0.64 * ringSize) / 2;
      const rim = ringSize / 2;
      const radius = Math.max(ringSize * 2.4, 0.32 * Math.max(window.innerWidth, window.innerHeight));
      /* The light rises and falls with the ring's energy (LivingRing's
         --mox-energy). In Chrome that is the whole canvas's opacity. In Safari,
         where the canvas lies plainly under the ring, it keeps a steady share
         of the light and the rest is a second, transparent canvas that pulses. */
      const full = light ? (safari ? 0.06 : 0.085) : 0;
      const strength = safari ? full * 0.6 : full;
      const fadeFrom = box.height * 0.6;
      const tint = [0, 208, 132];
      const img = ctx.createImageData(w, h);
      const px = img.data;

      for (let y = 0; y < h; y++) {
        const py = (y + 0.5) / scale;
        const bottom = 1 - smooth(fadeFrom, box.height, py);
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          px[i + 3] = 255;
          if (!strength) continue;
          const d = Math.hypot((x + 0.5) / scale - cx, py - cy);
          const a = strength * smooth(hole, rim, d) * Math.exp(-Math.pow(d / radius, 1.4)) * bottom;
          if (a < 1e-4) continue;
          const dither = Math.random() + Math.random() - 1;
          px[i] = tint[0] * a + dither;
          px[i + 1] = tint[1] * a + dither;
          px[i + 2] = tint[2] * a + dither;
        }
      }
      ctx.putImageData(img, 0, 0);

      const pel = pulse.current;
      const pctx = pel?.getContext("2d");
      if (safari && pel && pctx) {
        pel.width = w;
        pel.height = h;
        const pulsing = pctx.createImageData(w, h);
        const pp = pulsing.data;
        const share = full * 0.5;
        for (let y = 0; y < h && share; y++) {
          const py = (y + 0.5) / scale;
          const bottom = 1 - smooth(fadeFrom, box.height, py);
          for (let x = 0; x < w; x++) {
            const d = Math.hypot((x + 0.5) / scale - cx, py - cy);
            const a = share * smooth(hole, rim, d) * Math.exp(-Math.pow(d / radius, 1.4)) * bottom;
            if (a < 1e-4) continue;
            const i = (y * w + x) * 4;
            // Pure tint, strength in alpha: over the dark page, adding light.
            pp[i] = tint[0];
            pp[i + 1] = tint[1];
            pp[i + 2] = tint[2];
            pp[i + 3] = 255 * a + Math.random() + Math.random() - 1;
          }
        }
        pctx.putImageData(pulsing, 0, 0);
      }
    };

    frame = requestAnimationFrame(paint);

    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(paint, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [ring, ringSize, height, light, engine]);

  const place = "pointer-events-none absolute inset-x-0 top-[calc(-0.75rem-env(safe-area-inset-top))] w-full";
  return (
    <>
      <canvas
        ref={canvas}
        aria-hidden
        className={cn(
          place,
          /* Over the ring image (z-5) where it is added with plus-lighter; under
             the text and controls (z-10) either way. */
          engine === "other" && "z-[5]",
        )}
        style={{
          height,
          mixBlendMode: engine === "other" ? "plus-lighter" : undefined,
          opacity: engine === "other" ? "calc(0.6 + 0.5 * var(--mox-energy, 0.5))" : undefined,
        }}
      />
      {engine === "safari" ? (
        <canvas ref={pulse} aria-hidden className={place} style={{ height, opacity: "var(--mox-energy, 0.5)" }} />
      ) : null}
    </>
  );
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
