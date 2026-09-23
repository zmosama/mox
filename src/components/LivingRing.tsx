"use client";

import { useEffect, useRef } from "react";

/**
 * The ring from the identity board, glowing like something charged — a light
 * from inside that swells, surges and throws off waves, rather than a
 * highlight going round. The web twin of LivingRing.swift in the iPhone app:
 * the same `energy` curve, the same layers, the same speeds.
 *
 * All of it is drawn into one small canvas, every frame, with the canvas's own
 * `lighter` operation: light added to light, the way the app composites with
 * plusLighter. That is what makes the app's glow look luminous rather than
 * painted on — and unlike CSS blend modes and blur, which Safari drew as a
 * box, tiles and a wash, canvas arithmetic comes out the same in every
 * browser. Layers, as in the app:
 *  - a corona round the rim, rising and falling with the charge;
 *  - a bloom in the ring's own shape (`ring-bloom.png`, blurred beforehand);
 *  - the ring itself (`ring-light.png`: the artwork with its black made
 *    transparent), then the ring again, faintly, lit from inside;
 *  - waves of light leaving the rim, two in flight, each its own strength;
 *  - two hot spots wandering the rim.
 * The hole is cut clean at the end: the ring's black centre stays black.
 *
 * `--mox-energy` is published on <html> each frame so the screen-wide light in
 * Ambient rises and falls with the ring.
 */
export function LivingRing({ size }: { size: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Room for the waves, which travel out to nearly twice the ring's size.
  const side = size * 2.2;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    const scale = Math.min(window.devicePixelRatio || 1, 3);
    el.width = Math.round(side * scale);
    el.height = Math.round(side * scale);

    const ring = new Image();
    const bloom = new Image();
    ring.src = "/ring-light.png";
    bloom.src = "/ring-bloom.png";

    let frame = 0;
    let last = 0;
    let ready = false;
    Promise.all([ring.decode(), bloom.decode()]).then(
      () => (ready = true),
      () => (ready = true),
    );

    /* Everything added on top of the ring, scaled down together. Added light
       stacks up — layer on layer it came out far brighter than the app. */
    const glow = 0.15;
    const c = side / 2; // centre, in CSS pixels
    const r = size / 2;
    const image = size / 0.593; // the artwork's ring sits at 59% of its width

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!ready || now - last < 33) return; // ~30fps is plenty for something this slow
      last = now;

      const t = still ? 0 : Date.now() / 1000;
      const e = still ? 0.5 : energy(t);
      root.style.setProperty("--mox-energy", e.toFixed(3));

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, side, side);
      ctx.globalCompositeOperation = "lighter";

      // Corona: the app's blurred stroke at the rim, as a soft radial band.
      band(ctx, c, c, size * 0.52, size * 0.14 + size * 0.22, "0,208,132", glow * (0.1 + 0.3 * e));

      // Bloom in the ring's own shape.
      ctx.globalAlpha = Math.min(1, glow * (0.25 + 0.75 * e));
      ctx.drawImage(bloom, c - image / 2, c - image / 2, image, image);
      ctx.globalAlpha = 1;

      // Waves leaving the rim.
      const period = 7;
      for (let k = 0; k < 2; k++) {
        const cycle = t / period + k / 2;
        const phase = cycle - Math.floor(cycle);
        const born = Math.floor(cycle) * 2 + k;
        const strength = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(born * 12.9898 + 4.1));
        const radius = (size * (1 + phase * 0.9)) / 2;
        const width = size * 0.05 * (1 - phase * 0.6) + size * (0.06 + 0.12 * phase);
        band(ctx, c, c, radius, width, "167,243,208", glow * (1 - phase) ** 2 * 0.35 * strength * (0.4 + e));
      }

      // Hot spots wandering the rim, never quite settling.
      const angle = t * 0.09 + 1.6 * noise(t, 0.4);
      const angle2 = angle + 2.6 + noise(t, 9.2);
      spot(ctx, c + Math.cos(angle) * r * 1.02, c + Math.sin(angle) * r * 1.02, size * 0.3, "167,243,208", glow * (0.08 + 0.1 * (0.5 + 0.5 * noise(t, 3.9))) * (0.5 + e));
      spot(ctx, c + Math.cos(angle2) * r, c + Math.sin(angle2) * r, size * 0.37, "0,208,132", glow * 0.1 * (0.5 + e));

      /* The ring last and on top, in its own colours: under all that added
         light it came out nearly white. Then only a touch of light from inside. */
      ctx.globalCompositeOperation = "source-over";
      // On black, as the artwork was made: partly transparent, the ring let
      // the glow beneath show through and came out lighter than the original.
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(c, c, r * 0.985, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(ring, c - image / 2, c - image / 2, image, image);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, glow * 0.22 * e);
      ctx.drawImage(ring, c - image / 2, c - image / 2, image, image);
      ctx.globalAlpha = 1;

      // Nothing in the hole.
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(c, c, 0.64 * r, 0, Math.PI * 2);
      ctx.fill();

      if (still) cancelAnimationFrame(frame);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      root.style.removeProperty("--mox-energy");
    };
  }, [size, side]);

  return (
    <div aria-hidden className="pointer-events-none relative shrink-0" style={{ width: size * 1.25, height: size * 1.25 }}>
      <canvas
        ref={canvas}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: side, height: side }}
      />
    </div>
  );
}

/** A soft ring of light centred on radius `at`, fading over `width` either side. */
function band(ctx: CanvasRenderingContext2D, x: number, y: number, at: number, width: number, rgb: string, alpha: number) {
  if (alpha <= 0) return;
  const inner = Math.max(0, at - width);
  const outer = at + width;
  const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
  const mid = (at - inner) / (outer - inner);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(mid * 0.5, `rgba(${rgb},${alpha * 0.25})`);
  g.addColorStop(mid, `rgba(${rgb},${alpha})`);
  g.addColorStop(mid + (1 - mid) * 0.5, `rgba(${rgb},${alpha * 0.25})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
}

/** A soft disc of light. */
function spot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.45, `rgba(${rgb},${alpha * 0.4})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** How charged the ring is right now, about 0...1.2 — as in the app. */
function energy(t: number) {
  // Slow on purpose: a breath takes the better part of a minute to come round,
  // and a surge a few seconds to rise and settle.
  const breath = 0.5 + 0.5 * noise(t * 0.45, 2.3);
  // Mostly nothing, now and then a swell.
  const surge = Math.pow(Math.max(0, noise(t * 0.3, 4.4)), 3) * 3;
  // A faint, slow waver — not a flicker.
  const waver = ((Math.sin(t * 1.7) + Math.sin(t * 2.9 + 1.3)) / 2) * 0.03;
  return Math.min(Math.max(0.3 + 0.35 * breath + 0.5 * Math.min(surge, 1) + waver, 0), 1.2);
}

/** Smooth noise in -1...1 from three slow, unrelated sines. */
function noise(t: number, seed: number) {
  return (Math.sin(t * 0.37 + seed) + Math.sin(t * 0.598 + seed * 2.1) + Math.sin(t * 0.231 + seed * 0.7)) / 3;
}
