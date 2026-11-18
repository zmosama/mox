/**
 * The one door to a language model. Everything that asks one — MOX's chat,
 * the sports translations, memory upkeep — comes through here, so changing
 * provider or model is a change in one file, and MOX's soul and memory (which
 * live in our database) stay MOX's whatever answers.
 *
 * Two ways in, chosen by MOX_AI in the server's environment:
 *
 *   MOX_AI=subscription  the owner's own Claude subscription, through the
 *                        Claude Agent SDK (ai-subscription.ts). Needs
 *                        CLAUDE_CODE_OAUTH_TOKEN, which he makes himself with
 *                        `claude setup-token`.
 *   MOX_AI unset or api  the paid API, with ANTHROPIC_API_KEY. As it always was.
 *   MOX_AI=off           every model call is off.
 *
 * MOX_AI decides, and nothing else does. Claude Code on its own prefers an API
 * key to a subscription token when it finds both, which would quietly bill the
 * key — so in subscription mode the key is never handed to it (see
 * subscriptionEnv), and a subscription with no token is "not connected",
 * never a fall back to the key.
 *
 * Neither secret is stored in the database: the database goes to Google Drive
 * every night.
 */
import Anthropic from "@anthropic-ai/sdk";

/** Background work — translating, tidying memory: fast, and a tenth of a cent a story. */
export const BACKGROUND_MODEL = "claude-haiku-5-5";

/** What the owner can pick to talk with, cheapest first. */
export const CHAT_MODELS = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5 — fastest, cheapest" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 — smarter, 20× the price" },
  { id: "claude-opus-5-5", label: "Opus 5.5 — the most capable" },
] as const;
export const DEFAULT_CHAT_MODEL = "claude-sonnet-5-5";

type Env = Record<string, string | undefined>;

/**
 * Which way in the environment asks for, and whether it can be used:
 * "none" is a way that was asked for but has no secret to use.
 */
export type AiMode = "off" | "subscription" | "api" | "none";

export function aiMode(env: Env = process.env): AiMode {
  const want = env.MOX_AI?.trim().toLowerCase();
  if (want === "off") return "off";
  if (want === "subscription") return env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ? "subscription" : "none";
  return env.ANTHROPIC_API_KEY?.trim() ? "api" : "none";
}

export const aiAvailable = () => {
  const mode = aiMode();
  return mode === "subscription" || mode === "api";
};

/** One line for the owner's admin page: what MOX thinks with, or what is missing. */
export function aiStatus(env: Env = process.env): string {
  switch (aiMode(env)) {
    case "subscription":
      return "Connected through your Claude subscription.";
    case "api":
      return "Connected through the API key.";
    case "off":
      return "Switched off (MOX_AI=off).";
    default:
      return env.MOX_AI?.trim().toLowerCase() === "subscription"
        ? "Not connected: MOX_AI=subscription, but the server has no CLAUDE_CODE_OAUTH_TOKEN."
        : "Not connected: the server has no ANTHROPIC_API_KEY.";
  }
}

let client: Anthropic | null = null;

/** The API client. Two retries on 429/5xx are the SDK's own; a minute is the most any call may take. */
export function ai(): Anthropic {
  if (aiMode() !== "api") throw new Error("The API is not the way in (MOX_AI, ANTHROPIC_API_KEY)");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), timeout: 60_000, maxRetries: 2 });
  return client;
}

/** The text of a reply, joined. */
export function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
}

/**
 * One question, one answer in a given JSON shape, no tools — the background
 * jobs' call. Null when the model declined or ran out of room; throws when it
 * could not be reached at all (down, signed out, over its limit), so a caller
 * can tell a bad answer from no answer.
 */
export async function askJson(q: { model: string; system: string; user: string; schema: Record<string, unknown> }): Promise<unknown | null> {
  if (aiMode() === "subscription") {
    const { subscriptionJson } = await import("./ai-subscription");
    return subscriptionJson(q);
  }
  const res = await ai().messages.create({
    model: q.model,
    // Room for its thinking as well as the answer: only what it writes is billed.
    max_tokens: 16000,
    // Medium, not low: at low it read "two and a half tenths" as "a tenth and a quarter".
    output_config: { effort: "medium", format: { type: "json_schema", schema: q.schema } },
    system: q.system,
    messages: [{ role: "user", content: q.user }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  try {
    return JSON.parse(textOf(res.content));
  } catch {
    return null;
  }
}
