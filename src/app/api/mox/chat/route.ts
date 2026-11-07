import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiAvailable } from "@/lib/ai";
import { currentOwner } from "@/lib/auth";
import { moxTurn } from "@/lib/mox/agent";
import { chatHistory, clearChat } from "@/lib/mox/store";
import { takeRequest } from "@/lib/rate-limit";

/* MOX answers the owner and nobody else: anyone else gets a plain 404, as if there were nothing here. */
const nothing = () => NextResponse.json({ error: "not found" }, { status: 404 });

/** The conversation so far. */
export async function GET() {
  const owner = await currentOwner();
  if (!owner) return nothing();
  return NextResponse.json({ connected: aiAvailable(), lines: chatHistory(owner.id, 60) }, { headers: { "cache-control": "no-store" } });
}

/** Start over: the conversation is cleared; what MOX remembers stays. */
export async function DELETE() {
  const owner = await currentOwner();
  if (!owner) return nothing();
  clearChat(owner.id);
  return NextResponse.json({ ok: true });
}

const Body = z.object({ message: z.string().trim().min(1).max(4000) });

/** One message to MOX; the answer streams back as JSON lines (see agent.ts). */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return nothing();
  if (!aiAvailable()) return NextResponse.json({ error: "No model is connected" }, { status: 503 });
  // A guard against a stuck client looping, not a budget: 20 a minute is far past typing speed.
  if (!takeRequest(`mox:${owner.id}`, 20, 60_000).allowed) return NextResponse.json({ error: "Slow down a little" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say something" }, { status: 400 });

  const encoder = new TextEncoder();
  /* Next holds this request's scope (cookies, the signed-in user) only while
     POST runs; the body below is read afterwards, outside it. MOX's tools ask
     the app's own handlers, which read the cookie — so every step of the
     answer is run back inside this request. Without it, a search after the
     first words of a reply found nobody signed in, and the posters never came. */
  const inRequest = AsyncLocalStorage.snapshot();
  const turn = moxTurn(owner.id, owner.displayName ?? owner.username, parsed.data.message, req.signal);
  const stream = new ReadableStream({
    pull(controller) {
      return inRequest(async () => {
        const { value, done } = await turn.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      });
    },
    cancel() {
      return inRequest(() => void turn.return(undefined));
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
