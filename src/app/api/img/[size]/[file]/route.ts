import { imageType, tmdbImage, tmdbImageUrl, tmdbWebp, validImage, webpSource } from "@/lib/tmdb-images";

const HEADERS = {
  "cache-control": "public, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  // An SVG opened on its own is a page on our domain: let it run nothing.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

/* A view on the bytes, not a copy of them. */
const body = (bytes: Buffer) => new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);

/**
 * A TMDB picture from our own copy. A file name never changes what it shows,
 * so the answer is cached for good. If we don't have it and can't fetch it
 * right now, the browser is sent to TMDB itself rather than shown nothing.
 *
 * `{name}.webp` is our WebP of TMDB's `{name}.jpg` (see tmdbWebp); if that
 * can't be made, the JPEG is served in its place.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string; file: string }> }) {
  const { size, file } = await ctx.params;

  const source = webpSource(file);
  if (source) {
    if (!validImage(size, source)) return new Response("not found", { status: 404 });
    const webp = await tmdbWebp(size, file);
    if (webp) return new Response(body(webp), { headers: { "content-type": "image/webp", ...HEADERS } });
    // No WebP: the JPEG from our copy if we have it, TMDB's own if not.
    const original = await tmdbImage(size, source);
    if (original) return new Response(body(original), { headers: { "content-type": imageType(source), ...HEADERS } });
    return new Response(null, { status: 302, headers: { location: tmdbImageUrl(size, source), "cache-control": "no-store" } });
  }

  if (!validImage(size, file)) return new Response("not found", { status: 404 });
  const bytes = await tmdbImage(size, file);
  if (!bytes) {
    return new Response(null, {
      status: 302,
      headers: { location: tmdbImageUrl(size, file), "cache-control": "no-store" },
    });
  }
  return new Response(body(bytes), { headers: { "content-type": imageType(file), ...HEADERS } });
}
