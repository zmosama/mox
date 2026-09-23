import { NextResponse } from "next/server";
import { avatarUrl, currentUser } from "@/lib/auth";
import { MAX_AVATAR_BYTES, removeAvatar, saveAvatar } from "@/lib/avatars";

/**
 * Set your profile photo. The body is the image itself (the site and the app
 * both shrink it to a small square first), not a form.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  const saved = await saveAvatar(user.id, bytes);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });

  return NextResponse.json(
    { ok: true, avatar: avatarUrl({ id: user.id, avatarAt: saved.at }) },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Remove your profile photo; the initial comes back. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  await removeAvatar(user.id);
  return NextResponse.json({ ok: true, avatar: null }, { headers: { "cache-control": "no-store" } });
}
