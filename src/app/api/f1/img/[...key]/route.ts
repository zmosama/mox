import { f1Image } from "@/lib/f1-images";

/**
 * An F1 picture from our own mirror. Keys never change what they show within
 * a season, so the answer is cached for a week; the nightly refresh renews
 * the files behind them.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const key = (await ctx.params).key.join("/");
  const bytes = await f1Image(key);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=604800, stale-while-revalidate=2592000",
      "x-content-type-options": "nosniff",
    },
  });
}
