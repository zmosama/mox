/**
 * The one door to a language model. Everything that asks one — MOX's chat,
 * the sports translations, memory upkeep — comes through here, so changing
 * provider or model is a change in one file, and MOX's soul and memory (which
 * live in our database) stay MOX's whatever answers.
 *
 * The key is the server's (ANTHROPIC_API_KEY in the environment), never
 * stored in the database: the database goes to Google Drive every night.
 * MOX_AI=off switches every model call off.
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

export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.MOX_AI !== "off";

let client: Anthropic | null = null;

/** The shared client. Two retries on 429/5xx are the SDK's own; a minute is the most any call may take. */
export function ai(): Anthropic {
  if (!aiAvailable()) throw new Error("No model is connected (ANTHROPIC_API_KEY is not set)");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), timeout: 60_000, maxRetries: 2 });
  return client;
}

/** The text of a reply, joined. */
export function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
}
