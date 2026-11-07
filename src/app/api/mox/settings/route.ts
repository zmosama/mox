import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAT_MODELS } from "@/lib/ai";
import { currentOwner } from "@/lib/auth";
import { moxSettings, saveMoxSettings } from "@/lib/mox/store";

const Body = z.object({
  /** Empty or null goes back to MOX's own default soul. */
  soul: z.string().max(4000).nullable().optional(),
  chatModel: z.enum(CHAT_MODELS.map((m) => m.id) as [string, ...string[]]).optional(),
});

/** MOX's soul and the model it talks with. Owner only. */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  saveMoxSettings(owner.id, parsed.data);
  return NextResponse.json(moxSettings(owner.id));
}
