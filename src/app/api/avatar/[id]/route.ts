import { readAvatar } from "@/lib/avatars";

/**
 * A profile photo. The URL carries the photo's version (?v=), so the file can
 * be cached for good: a new photo is a new URL.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("not found", { status: 404 });

  const photo = await readAvatar(id);
  if (!photo) return new Response("not found", { status: 404 });

  return new Response(Buffer.from(photo.bytes), {
    headers: {
      "content-type": photo.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
