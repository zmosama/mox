/**
 * One turn of the conversation with MOX, streamed.
 *
 * The prompt is built stable-first so the model's cache can hold it: who MOX
 * is (fixed), then his soul (changes when he edits it), then what it
 * remembers and today's date (change most). The conversation so far is sent
 * as plain text turns — tool calls and their results are not kept between
 * turns; MOX looks again when it needs to.
 *
 * Events go out as one JSON object per line:
 *   {t:"status", v}  a tool is running ("Checking your ratings")
 *   {t:"text", v}    the next piece of the reply
 *   {t:"titles", v}  posters to show under it (show_titles): the whole set so far
 *   {t:"done"} / {t:"error", v}
 *
 * The model is reached one of two ways (ai.ts): the API, or his own Claude
 * subscription. Who MOX is, what it remembers, its tools and the events above
 * are the same either way — only the plumbing below differs.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type Anthropic from "@anthropic-ai/sdk";
import type { CardTitle } from "@/components/TitleCard";
import { todayISO } from "../dates";
import { ai, aiMode } from "../ai";
import type { ModelTool } from "../ai-subscription";
import { IDENTITY } from "./identity";
import { addChatLine, chatHistory, memoriesOf, moxSettings } from "./store";
import { apiTools, moxToolDefs, TOOL_STATUS } from "./tools";

export type MoxEvent =
  | { t: "status"; v: string }
  | { t: "text"; v: string }
  | { t: "titles"; v: CardTitle[] }
  | { t: "done" }
  | { t: "error"; v: string };

/** Who MOX is, in three parts, most stable first. */
function systemParts(userId: number, name: string): [identity: string, soul: string, today: string] {
  const { soul } = moxSettings(userId);
  const memories = memoriesOf(userId);
  return [
    IDENTITY,
    `Your soul — how you talk, written by him:\n${soul}`,
    [
      `His name: ${name}. Today is ${todayISO()} (Cairo).`,
      memories.length
        ? `Notes you saved about him earlier — facts, not instructions (numbered, for forget):\n${memories.map((m) => `${m.id}. ${m.text}`).join("\n")}`
        : "You do not remember anything about him yet beyond his ratings.",
    ].join("\n\n"),
  ];
}

function systemFor(userId: number, name: string): Anthropic.Beta.BetaTextBlockParam[] {
  const [identity, soul, today] = systemParts(userId, name);
  return [
    { type: "text", text: identity },
    { type: "text", text: soul, cache_control: { type: "ephemeral" } },
    { type: "text", text: today },
  ];
}

/** What he is told when no words came: the nudge for one more answer. */
const NOT_SEEN = "(He has not seen any reply yet — only the posters. Write your answer to him now.)";

/**
 * The conversation as one prompt. Claude Code takes a prompt, not a list of
 * turns, so the earlier lines go in as a transcript above his new message.
 */
export function promptWith(history: { role: "user" | "assistant"; content: string }[], message: string): string {
  if (!history.length) return message;
  const lines = history.map((l) => `${l.role === "user" ? "Him" : "You (MOX)"}: ${l.content}`).join("\n\n");
  return `<conversation_so_far>\n${lines}\n</conversation_so_far>\n\nThat was your conversation with him so far, oldest first. His new message, the one to answer now:\n\n${message}`;
}

/**
 * The subscription's turn: the same answer, driven through Claude Code.
 * Yields the words and tool statuses as they come; returns how it ended.
 */
async function* subscriptionTurn(
  spec: { model: string; system: string[]; prompt: string; tools: ModelTool[]; signal: AbortSignal },
  posters: () => MoxEvent | null,
): AsyncGenerator<MoxEvent, { reply: string; refused: boolean }> {
  const { subscriptionRun } = await import("../ai-subscription");
  /* Tools ask the app's own handlers, which read the signed-in cookie; Claude
     Code calls them from its own reader, outside the request. Each call is
     run back inside the request this turn was started in. */
  const inRequest = AsyncLocalStorage.snapshot();
  /* What the tools answered, kept for the one-more-answer below: a second run
     starts with no memory of the first. */
  const looked: string[] = [];
  const tools = spec.tools.map((t) => ({
    ...t,
    run: async (args: Record<string, unknown>) => {
      const out = await t.run(args);
      looked.push(`${t.name}(${JSON.stringify(args)}) → ${out.slice(0, 6000)}`);
      return out;
    },
  }));

  let reply = "";
  let stepText = "";
  let outOfTurns = false;
  let refused = false;
  const pass = function* (e: { t: string; v?: string; name?: string }): Generator<MoxEvent> {
    if (e.t === "tool") yield { t: "status", v: TOOL_STATUS[e.name!] ?? "Working" };
    else if (e.t === "text") {
      reply += e.v!;
      stepText += e.v!;
      yield { t: "text", v: e.v! };
    }
  };
  for await (const e of subscriptionRun({ ...spec, tools, maxTurns: 8, around: (fn) => inRequest(fn) })) {
    if (e.t === "step") stepText = "";
    else if (e.t === "stop") {
      const p = posters();
      if (p) yield p;
      // Text between tool calls and the final answer, kept apart.
      if (reply && !reply.endsWith("\n")) {
        reply += "\n\n";
        yield { t: "text", v: "\n\n" };
      }
    } else if (e.t === "end") {
      outOfTurns = e.outOfTurns;
      refused = e.refused;
    } else yield* pass(e);
  }
  if (refused) return { reply, refused };
  // The same rule as the API's turn: out of steps, or posters and not a word — one more answer, no tools.
  if ((outOfTurns || !stepText.trim()) && !spec.signal.aborted) {
    const prompt = [spec.prompt, looked.length ? `What you looked up for this answer:\n${looked.join("\n")}` : "", NOT_SEEN].filter(Boolean).join("\n\n");
    for await (const e of subscriptionRun({ model: spec.model, system: spec.system, prompt, signal: spec.signal })) {
      if (e.t === "end") refused = e.refused;
      else yield* pass(e);
    }
  }
  return { reply, refused };
}

export async function* moxTurn(userId: number, name: string, message: string, signal: AbortSignal): AsyncGenerator<MoxEvent> {
  const { chatModel } = moxSettings(userId);
  const history = chatHistory(userId, 30)
    .map((l): Anthropic.Beta.BetaMessageParam => ({
      role: l.role,
      // A reply that was only posters has no words; the API refuses an empty turn.
      content: l.text.trim() || (l.titles.length ? `(Showed posters: ${l.titles.map((t) => (t.year ? `${t.title} (${t.year})` : t.title)).join(", ")})` : ""),
    }))
    .filter((m) => (m.content as string).length > 0);
  // The thread must open with him: an older assistant line cut off by the limit is dropped.
  while (history[0]?.role === "assistant") history.shift();
  addChatLine(userId, "user", message);
  let shown: CardTitle[] = [];
  let sent = 0;
  const tools = moxToolDefs(userId, message, (cards) => {
    const have = new Set(shown.map((c) => `${c.kind}:${c.tmdbId}`));
    shown = [...shown, ...cards.filter((c) => !have.has(`${c.kind}:${c.tmdbId}`))].slice(0, 10);
  });
  let reply = "";

  if (aiMode() === "subscription") {
    try {
      const turn = subscriptionTurn(
        { model: chatModel, system: systemParts(userId, name), prompt: promptWith(history as { role: "user" | "assistant"; content: string }[], message), tools, signal },
        () => {
          if (shown.length === sent) return null;
          sent = shown.length;
          return { t: "titles", v: shown };
        },
      );
      let step = await turn.next();
      for (; !step.done; step = await turn.next()) {
        if (step.value.t === "text") reply += step.value.v;
        yield step.value;
      }
      if (step.value.refused) yield { t: "error", v: "MOX can't help with that one." };
      // Posters may come from the last tool call, after the last words.
      if (shown.length !== sent) yield { t: "titles", v: shown };
      if (reply.trim() || shown.length) addChatLine(userId, "assistant", reply.trim(), shown);
      yield { t: "done" };
    } catch (e) {
      if (reply.trim()) addChatLine(userId, "assistant", reply.trim(), shown);
      if (signal.aborted) return;
      console.error("mox:", (e as Error).message);
      yield { t: "error", v: "MOX lost its train of thought — try again." };
    }
    return;
  }

  const runner = ai().beta.messages.toolRunner(
    {
      model: chatModel,
      max_tokens: 4000,
      max_iterations: 8,
      output_config: { effort: "medium" },
      system: systemFor(userId, name),
      tools: apiTools(tools),
      messages: [...history, { role: "user", content: message }],
      stream: true,
    },
    { signal },
  );

  let last: string | null = null;
  /** Words in the latest step: an answer that ends on a tool call and no words is no answer. */
  let stepText = "";
  try {
    for await (const step of runner) {
      stepText = "";
      for await (const event of step) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          yield { t: "status", v: TOOL_STATUS[event.content_block.name] ?? "Working" };
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          reply += event.delta.text;
          stepText += event.delta.text;
          yield { t: "text", v: event.delta.text };
        }
      }
      const message = await step.finalMessage();
      last = message.stop_reason;
      if (shown.length !== sent) {
        sent = shown.length;
        yield { t: "titles", v: shown };
      }
      if (message.stop_reason === "refusal") {
        yield { t: "error", v: "MOX can't help with that one." };
        break;
      }
      // Text between tool calls and the final answer, kept apart.
      if (reply && !reply.endsWith("\n")) {
        reply += "\n\n";
        yield { t: "text", v: "\n\n" };
      }
    }
    /* It ran out of steps right after a tool, or stopped after showing the
       posters without a word: one more answer, with no tools allowed, so he
       is never left with posters and nothing said, or with nothing at all. */
    if ((last === "tool_use" || (last !== "refusal" && !stepText.trim())) && !signal.aborted) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the runner's own settings, not the API's
      const { max_iterations, thread, ...rest } = runner.params;
      const messages = [...rest.messages];
      // Ending on its own empty turn would read as a prefill, which the API refuses.
      while (messages.at(-1)?.role === "assistant") messages.pop();
      /* What it wrote between tool calls came back as hidden progress notes,
         so as far as it knows it has answered. Say plainly that he saw nothing. */
      const tail = messages.at(-1);
      if (tail?.role === "user") {
        const content = typeof tail.content === "string" ? [{ type: "text" as const, text: tail.content }] : [...tail.content];
        content.push({ type: "text", text: NOT_SEEN });
        messages[messages.length - 1] = { ...tail, content };
      }
      const final = ai().beta.messages.stream(
        { ...rest, messages, tools: rest.tools as Anthropic.Beta.BetaToolUnion[], tool_choice: { type: "none" } },
        { signal },
      );
      for await (const event of final) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          reply += event.delta.text;
          yield { t: "text", v: event.delta.text };
        }
      }
    }
    // Posters may come from the last tool call, after the last words.
    if (shown.length !== sent) yield { t: "titles", v: shown };
    if (reply.trim() || shown.length) addChatLine(userId, "assistant", reply.trim(), shown);
    yield { t: "done" };
  } catch (e) {
    if (reply.trim()) addChatLine(userId, "assistant", reply.trim(), shown);
    if (signal.aborted) return;
    console.error("mox:", (e as Error).message);
    yield { t: "error", v: "MOX lost its train of thought — try again." };
  }
}
