/**
 * The subscription way in (MOX_AI=subscription, see ai.ts): the owner's own
 * Claude subscription, through the Claude Agent SDK. The SDK does not call the
 * API itself — it starts Claude Code, the same program he uses at his desk,
 * signed in with the token he made with `claude setup-token`, and talks to it.
 *
 * Claude Code is a programmer's tool: left as it comes it can read and write
 * files, run commands and browse. None of that belongs in MOX, so every run
 * here is locked down, and the lock is checked rather than trusted:
 *
 *  - no built-in tools at all (`tools: []`); the only tools are the ones MOX
 *    hands over, which run inside this server, not in Claude Code;
 *  - nothing is read from disk: no settings, no CLAUDE.md, no other MCP
 *    servers, no saved sessions; it starts in an empty folder;
 *  - anything not on the list is refused without asking (there is nobody to ask);
 *  - Claude Code gets a small environment of its own — the token, and none of
 *    the server's other secrets. Above all not ANTHROPIC_API_KEY, which it
 *    would use in place of the subscription without saying so;
 *  - when it starts it reports the tools it has and how it signed in. A tool
 *    that is not MOX's, or a sign-in that is not the subscription, stops the
 *    run before a word is sent (checkStart).
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSdkMcpServer, query, tool, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";

/** A tool as MOX defines it once, for either way in: it takes checked input and answers in text. */
export type ModelTool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  inputSchema: S;
  run: (args: z.infer<S>) => Promise<string>;
};

type Env = Record<string, string | undefined>;

/** The name MOX's tools are served under; Claude Code calls them mcp__mox__<name>. */
const SERVER = "mox";
const PREFIX = `mcp__${SERVER}__`;
export const toolId = (name: string) => `${PREFIX}${name}`;
const ANSWER_TOOL = "StructuredOutput";
export const bareToolName = (id: string) => (id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id);

/** Claude Code's own folder: in the container's /tmp, never on /data, which is backed up to Drive. */
const HOME_DIR = join(tmpdir(), "mox-claude");
/** Where it "works": a folder with nothing in it. */
const EMPTY_DIR = join(HOME_DIR, "empty");

/** What Claude Code may inherit from the server: enough to run and reach the network, and no secrets. */
const PASSED_ON = ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "TMPDIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"];

/**
 * The whole environment Claude Code runs in. Built from nothing rather than
 * by removing things, so a new secret added to the server tomorrow is not
 * passed on by default.
 */
export function subscriptionEnv(env: Env = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PASSED_ON) if (env[k]) out[k] = env[k]!;
  return {
    ...out,
    CLAUDE_CODE_OAUTH_TOKEN: env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ?? "",
    CLAUDE_CONFIG_DIR: HOME_DIR,
    // It is a pinned part of the image: it must not update itself, phone home, or keep notes of its own.
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  };
}

export type RunSpec = {
  model: string;
  /** The system prompt, stable part first. */
  system: string[];
  prompt: string;
  /** MOX's tools for this run; none means a plain answer. */
  tools?: ModelTool[];
  /** How many times it may go round (answer, call tools, answer again). */
  maxTurns?: number;
  /** Ask for the answer as JSON in this shape. */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Runs each tool call; the chat uses it to put the call back inside the request it belongs to. */
  around?: <T>(fn: () => Promise<T>) => Promise<T>;
};

/** Everything Claude Code is started with. Pure, so the lock can be tested without starting it. */
export function lockedOptions(spec: RunSpec, env: Env = process.env): Options {
  const tools = spec.tools ?? [];
  const around = spec.around ?? ((fn) => fn());
  return {
    model: spec.model,
    systemPrompt: spec.system,
    // No built-in tools: no files, no shell, no web.
    tools: [],
    // Only our own server, and only if there is something on it.
    mcpServers: tools.length
      ? {
          [SERVER]: createSdkMcpServer({
            name: SERVER,
            // In the prompt from the first word, not behind a tool search.
            alwaysLoad: true,
            tools: tools.map((t) =>
              tool(t.name, t.description, t.inputSchema.shape, async (args) => ({
                content: [{ type: "text" as const, text: await around(() => t.run(t.inputSchema.parse(args))) }],
              })),
            ),
          }),
        }
      : {},
    strictMcpConfig: true,
    allowedTools: tools.map((t) => toolId(t.name)),
    // Not on the list: refused, with nobody asked.
    permissionMode: "dontAsk",
    permissionPrompts: "none",
    // Nothing from disk, nothing left on it.
    settingSources: [],
    skills: [],
    persistSession: false,
    cwd: EMPTY_DIR,
    env: subscriptionEnv(env),
    includePartialMessages: true,
    effort: "medium",
    ...(spec.maxTurns ? { maxTurns: spec.maxTurns } : {}),
    ...(spec.schema ? { outputFormat: { type: "json_schema" as const, schema: spec.schema } } : {}),
  };
}

/**
 * What Claude Code says about itself as it starts, held against what was
 * asked for. Throws on any tool that is not one of ours, on one of ours that
 * is missing (the SDK leaves out a tool it cannot describe, with only a
 * warning), and on any sign-in other than the subscription.
 */
export function checkStart(start: { tools: string[]; apiKeySource: string }, allowed: string[], shaped = false) {
  const ours = new Set(allowed.map(toolId));
  /* Asked for an answer in a JSON shape, Claude Code adds one tool of its own
     to hand that answer back in. It reads and changes nothing; it is expected
     then, and only then. */
  if (shaped) ours.add(ANSWER_TOOL);
  const extra = start.tools.filter((t) => !ours.has(t));
  if (extra.length) throw new Error(`Claude Code started with tools MOX did not give it: ${extra.join(", ")}`);
  const missing = allowed.filter((t) => !start.tools.includes(toolId(t)));
  if (missing.length) throw new Error(`Claude Code started without some of MOX's tools: ${missing.join(", ")}`);
  // "none" is how it reports a subscription sign-in: no API key of any kind in use.
  if (start.apiKeySource !== "none") throw new Error(`Claude Code signed in with "${start.apiKeySource}", not the subscription`);
}

export type RunEvent =
  /** The model starts writing a message. */
  | { t: "step" }
  /** It is calling one of MOX's tools (the bare name). */
  | { t: "tool"; name: string }
  | { t: "text"; v: string }
  /** That message is finished, and why it stopped ("end_turn", "tool_use", "refusal"…). */
  | { t: "stop"; reason: string | null }
  /** The run is over. `outOfTurns`: it was still calling tools when it hit maxTurns. */
  | { t: "end"; outOfTurns: boolean; refused: boolean; structured?: unknown };

/**
 * One run, as it happens. Throws when the model could not be reached or the
 * run broke — signed out, over the subscription's limit, Claude Code missing —
 * because the SDK reports those as messages, not exceptions, and a caller must
 * never mistake them for an answer.
 */
export async function* subscriptionRun(spec: RunSpec): AsyncGenerator<RunEvent> {
  mkdirSync(EMPTY_DIR, { recursive: true, mode: 0o700 });
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  if (spec.signal?.aborted) abort.abort();
  spec.signal?.addEventListener("abort", onAbort, { once: true });

  let said = "";
  const run = query({
    prompt: spec.prompt,
    options: { ...lockedOptions(spec), abortController: abort, stderr: (d) => void (said = (said + d).slice(-600)) },
  });
  let started = false;
  let refused = false;
  try {
    for await (const m of run) {
      if (m.type === "system" && m.subtype === "init") {
        checkStart(m, (spec.tools ?? []).map((t) => t.name), Boolean(spec.schema));
        started = true;
      } else if (m.type === "system" && m.subtype === "model_refusal_no_fallback") {
        refused = true;
      } else if (m.type === "stream_event" && m.parent_tool_use_id === null) {
        // Nothing is passed on from a run whose start was not checked.
        if (!started) throw new Error("Claude Code answered before reporting how it started");
        const e = m.event;
        if (e.type === "message_start") yield { t: "step" };
        else if (e.type === "content_block_start" && e.content_block.type === "tool_use") yield { t: "tool", name: bareToolName(e.content_block.name) };
        else if (e.type === "content_block_delta" && e.delta.type === "text_delta") yield { t: "text", v: e.delta.text };
        else if (e.type === "message_delta") {
          if (e.delta.stop_reason === "refusal") refused = true;
          yield { t: "stop", reason: e.delta.stop_reason ?? null };
        }
      } else if (m.type === "assistant" && m.error) {
        throw new Error(`the model could not answer (${m.error})`);
      } else if (m.type === "result") {
        if (m.subtype === "success" && !m.is_error) yield { t: "end", outOfTurns: false, refused, structured: m.structured_output };
        else if (m.subtype === "error_max_turns") yield { t: "end", outOfTurns: true, refused };
        // It answered, but never in the shape asked for: a bad answer, not an outage.
        else if (m.subtype === "error_max_structured_output_retries") yield { t: "end", outOfTurns: false, refused };
        else throw new Error(`the run failed (${m.subtype}${"errors" in m && m.errors?.length ? `: ${m.errors.join("; ")}` : ""})`);
        return;
      }
    }
    // Cut short by the caller, or died: either way there was no answer, and that is never passed off as one.
    throw new Error(spec.signal?.aborted ? "the run was cut short" : "Claude Code stopped without a result");
  } catch (e) {
    const tail = said.trim().split("\n").at(-1);
    if (tail && !spec.signal?.aborted && e instanceof Error) e.message += ` — ${tail}`;
    throw e;
  } finally {
    spec.signal?.removeEventListener("abort", onAbort);
    // Never leave a Claude Code process behind, however the run ended.
    run.close();
  }
}

/* Each run is a Claude Code process of a few hundred megabytes. The chat is
   one at a time by nature; background work waits its turn here. */
const AT_ONCE = 2;
let running = 0;
const waiting: (() => void)[] = [];
async function turn<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** ai.ts's askJson, on the subscription. Two minutes is the most one answer may take. */
export function subscriptionJson(q: { model: string; system: string; user: string; schema: Record<string, unknown> }): Promise<unknown | null> {
  return turn(async () => {
    let out: unknown | null = null;
    // The answer in a shape is itself a tool call inside Claude Code, so one round is not enough.
    const run = subscriptionRun({ model: q.model, system: [q.system], prompt: q.user, schema: q.schema, maxTurns: 4, signal: AbortSignal.timeout(120_000) });
    let ended = false;
    for await (const e of run) {
      if (e.t !== "end") continue;
      ended = true;
      out = e.refused ? null : (e.structured ?? null);
    }
    // No ending is no answer (it was not reached), which is not the same as a bad one.
    if (!ended) throw new Error("the model gave no answer");
    return out;
  });
}
