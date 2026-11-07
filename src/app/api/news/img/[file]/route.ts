import { readNewsImage } from "@/lib/news-images";

/** A sports story's picture, from our own copy (news-images.ts). Named by content: cached for good. */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const bytes = await readNewsImage((await ctx.params).file);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
