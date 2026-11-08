import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAT_MODELS } from "@/lib/ai";
import { currentOwner } from "@/lib/auth";
import { DEFAULT_SOUL } from "@/lib/mox/identity";
import { moxSettings, saveMoxSettings } from "@/lib/mox/store";

const Body = z.object({
  /** Empty or null goes back to MOX's own default soul. */
  soul: z.string().max(4000).nullable().optional(),
  chatModel: z.enum(CHAT_MODELS.map((m) => m.id) as [string, ...string[]]).optional(),
});

/** The soul as he wrote it ("" while MOX's own), the default, and the models to pick from — for the iPhone app, which has no server page. */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "not found" }, { status: 404 });
  const s = moxSettings(owner.id);
  return NextResponse.json(
    { soul: s.customSoul ? s.soul : "", defaultSoul: DEFAULT_SOUL, chatModel: s.chatModel, models: CHAT_MODELS.map((m) => ({ ...m })) },
    { headers: { "cache-control": "no-store" } },
  );
}

/** MOX's soul and the model it talks with. Owner only. */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  saveMoxSettings(owner.id, parsed.data);
  return NextResponse.json(moxSettings(owner.id));
}
