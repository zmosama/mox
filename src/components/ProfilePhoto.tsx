"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Your profile photo, shown in place of your initial on Home. The photo is
 * cropped to a centred square and shrunk to 320px here, in the browser, so
 * what is uploaded is small whatever the camera made.
 */
export function ProfilePhoto({ name, avatar }: { name: string; avatar: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = await squareJpeg(file, 320);
      const res = await fetch("/api/account/avatar", { method: "POST", headers: { "content-type": "image/jpeg" }, body });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    await fetch("/api/account/avatar", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="flex items-center gap-4">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-love/70 bg-love-soft text-[32px] font-semibold text-bg">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small, already-sized photo
          <img src={avatar} alt="" className="size-full object-cover" />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[17px] font-semibold">{name}</div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="rounded-full bg-love px-4 py-2 text-[13px] font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : avatar ? "Change photo" : "Add a photo"}
          </button>
          {avatar ? (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-full bg-surface px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-card disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        {error ? <p className="text-[12.5px] text-against">{error}</p> : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
    </section>
  );
}

/** Crop to a centred square and re-encode as a small JPEG. */
async function squareJpeg(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the photo");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo"))), "image/jpeg", 0.86),
  );
}
