import { NextResponse } from "next/server";
import { z } from "zod";
import { currentOwner } from "@/lib/auth";
import { addMemory, deleteMemory, memoriesOf } from "@/lib/mox/store";

const nothing = () => NextResponse.json({ error: "not found" }, { status: 404 });

/** What MOX remembers about the owner — all of it, to read. */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return nothing();
  return NextResponse.json({ memories: memoriesOf(owner.id) }, { headers: { "cache-control": "no-store" } });
}

/** Tell MOX something to remember, in his own words. */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return nothing();
  const parsed = z.object({ text: z.string().trim().min(3).max(300) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Too short" }, { status: 400 });
  addMemory(owner.id, parsed.data.text, "told");
  return NextResponse.json({ memories: memoriesOf(owner.id) });
}

/** Forget one: `?id=`. */
export async function DELETE(req: Request) {
  const owner = await currentOwner();
  if (!owner) return nothing();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Which one?" }, { status: 400 });
  deleteMemory(owner.id, id);
  return NextResponse.json({ memories: memoriesOf(owner.id) });
}
