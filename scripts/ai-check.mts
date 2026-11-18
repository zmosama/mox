/**
 * Is the subscription way in to the model (src/lib/ai-subscription.ts) working
 * and locked down, here, in this environment? Run it inside the container:
 *
 *   node_modules/.bin/tsx scripts/ai-check.mts
 *
 * It starts Claude Code exactly as MOX does, with one harmless tool, and prints
 * what Claude Code reports about itself — its tools and how it signed in —
 * then has it call the tool and answer. It reads no database and changes
 * nothing. Exits 1 if anything is off.
 */
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { BACKGROUND_MODEL } from "../src/lib/ai";
import { checkStart, lockedOptions, subscriptionRun, type ModelTool } from "../src/lib/ai-subscription";
import { mkdirSync } from "node:fs";

if (!process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
  console.error("CLAUDE_CODE_OAUTH_TOKEN is not set here.");
  process.exit(1);
}

let called = 0;
const ping: ModelTool = { name: "ping", description: "Returns the secret word. Call it when asked for the secret word.", inputSchema: z.object({}), run: async () => (called++, "The secret word is: falafel") };
const spec = { model: BACKGROUND_MODEL, system: ["You are a test. Be brief."], prompt: "Call the ping tool, then tell me the secret word. Then list every tool you have, by exact name.", tools: [ping] };

// What it starts with, read straight from Claude Code.
const opts = lockedOptions(spec);
mkdirSync(opts.cwd!, { recursive: true });
const probe = query({ prompt: "Say OK.", options: opts });
for await (const m of probe) {
  if (m.type === "system" && m.subtype === "init") {
    console.log(`Claude Code ${m.claude_code_version}, model ${m.model}`);
    console.log(`  signed in with: ${m.apiKeySource === "none" ? "the subscription (no API key in use)" : m.apiKeySource}`);
    console.log(`  tools: ${m.tools.join(", ") || "(none)"}`);
    console.log(`  MCP servers: ${m.mcp_servers.map((s) => `${s.name} (${s.status})`).join(", ") || "(none)"}`);
    console.log(`  permission mode: ${m.permissionMode}; skills: ${m.skills.length}; plugins: ${m.plugins.length}; agents: ${m.agents?.length ?? 0}`);
    checkStart(m, ["ping"]);
    break;
  }
}
probe.close();

// And a real run through the same door MOX uses.
let text = "";
for await (const e of subscriptionRun(spec)) {
  if (e.t === "tool") console.log(`  → tool call: ${e.name}`);
  else if (e.t === "text") text += e.v;
}
console.log(`  answer: ${text.trim()}`);
if (!called || !/falafel/i.test(text)) {
  console.error("The tool was not called, or its answer did not come back.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
