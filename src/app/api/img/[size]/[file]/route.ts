import { imageType, tmdbImage, tmdbImageUrl, validImage } from "@/lib/tmdb-images";

/**
 * A TMDB picture from our own copy. A file name never changes what it shows,
 * so the answer is cached for good. If we don't have it and can't fetch it
 * right now, the browser is sent to TMDB itself rather than shown nothing.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string; file: string }> }) {
  const { size, file } = await ctx.params;
  if (!validImage(size, file)) return new Response("not found", { status: 404 });
  const bytes = await tmdbImage(size, file);
  if (!bytes) {
    return new Response(null, {
      status: 302,
      headers: { location: tmdbImageUrl(size, file), "cache-control": "no-store" },
    });
  }
  // A view on the bytes, not a copy of them.
  return new Response(new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength), {
    headers: {
      "content-type": imageType(file),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      // An SVG opened on its own is a page on our domain: let it run nothing.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
