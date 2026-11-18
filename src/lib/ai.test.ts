import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiMode, aiStatus } from "./ai";
import { bareToolName, checkStart, lockedOptions, subscriptionEnv, toolId, type ModelTool } from "./ai-subscription";

const KEY = { ANTHROPIC_API_KEY: "sk-ant-test" };
const TOKEN = { CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-test" };

describe("which way in to the model", () => {
  it("is the API key when nothing else is said — as it always was", () => {
    expect(aiMode(KEY)).toBe("api");
    expect(aiMode({ ...KEY, MOX_AI: "api" })).toBe("api");
  });

  it("is the subscription when MOX_AI asks for it and the token is there", () => {
    expect(aiMode({ ...TOKEN, MOX_AI: "subscription" })).toBe("subscription");
    expect(aiMode({ ...TOKEN, MOX_AI: " Subscription " })).toBe("subscription");
  });

  it("MOX_AI wins over whichever secrets happen to be present", () => {
    // Both present: the key does not override a subscription that was asked for…
    expect(aiMode({ ...KEY, ...TOKEN, MOX_AI: "subscription" })).toBe("subscription");
    // …and a token lying around does not move an API setup onto the subscription.
    expect(aiMode({ ...KEY, ...TOKEN })).toBe("api");
    expect(aiMode({ ...TOKEN })).toBe("none");
  });

  it("never falls back to the paid key when the subscription has no token", () => {
    expect(aiMode({ ...KEY, MOX_AI: "subscription" })).toBe("none");
    expect(aiMode({ ...KEY, CLAUDE_CODE_OAUTH_TOKEN: "  ", MOX_AI: "subscription" })).toBe("none");
    expect(aiStatus({ ...KEY, MOX_AI: "subscription" })).toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("is off when switched off, whatever is present", () => {
    expect(aiMode({ ...KEY, ...TOKEN, MOX_AI: "off" })).toBe("off");
  });

  it("is nothing with no secret at all", () => {
    expect(aiMode({})).toBe("none");
    expect(aiStatus({})).toContain("ANTHROPIC_API_KEY");
  });
});

describe("what Claude Code is given to run in", () => {
  const server = { ...KEY, ...TOKEN, MOX_AI: "subscription", PATH: "/usr/bin", HOME: "/home/node", TMDB_API_KEY: "t", MOX_SECRET: "s", ANTHROPIC_AUTH_TOKEN: "a", ANTHROPIC_BASE_URL: "https://elsewhere", CLAUDE_CODE_USE_BEDROCK: "1" };
  const env = subscriptionEnv(server);

  it("has the token, and not the API key that Claude Code would use in its place", () => {
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat-test");
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("has nothing else that changes who it signs in as or where it calls", () => {
    for (const k of Object.keys(env)) expect(k).not.toMatch(/^ANTHROPIC_|^CLAUDE_CODE_USE_|^AWS_|^GOOGLE_/);
  });

  it("has none of the server's other secrets — only what is listed", () => {
    expect(Object.keys(env).sort()).toEqual(
      ["CLAUDE_CODE_DISABLE_AUTO_MEMORY", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR", "DISABLE_AUTOUPDATER", "HOME", "PATH"].sort(),
    );
  });

  it("keeps Claude Code's own folder off /data, which is backed up to Drive", () => {
    expect(env.CLAUDE_CONFIG_DIR).not.toMatch(/^\/data/);
  });
});

describe("the lock on Claude Code", () => {
  const tools: ModelTool[] = [
    { name: "search_titles", description: "Search", inputSchema: z.object({ query: z.string() }), run: async () => "[]" },
    { name: "remember", description: "Remember", inputSchema: z.object({ fact: z.string() }), run: async () => "{}" },
  ];
  const opts = lockedOptions({ model: "claude-haiku-5-5", system: ["You are MOX."], prompt: "hi", tools }, { ...KEY, ...TOKEN });

  it("switches every built-in tool off: no files, no shell, no web", () => {
    expect(opts.tools).toEqual([]);
  });

  it("allows MOX's tools by name and nothing else — no wildcard, no built-in", () => {
    expect(opts.allowedTools).toEqual(["mcp__mox__search_titles", "mcp__mox__remember"]);
    for (const t of opts.allowedTools!) expect(t).toMatch(/^mcp__mox__[a-z_]+$/);
  });

  it("serves them from one server of ours, and listens to no other", () => {
    expect(Object.keys(opts.mcpServers!)).toEqual(["mox"]);
    expect(opts.strictMcpConfig).toBe(true);
  });

  it("refuses what is not allowed without asking, and can never be told to skip the check", () => {
    expect(opts.permissionMode).toBe("dontAsk");
    expect(opts.permissionPrompts).toBe("none");
    expect(opts.allowDangerouslySkipPermissions).toBeUndefined();
    expect(opts.canUseTool).toBeUndefined();
  });

  it("reads nothing from disk and leaves nothing on it", () => {
    expect(opts.settingSources).toEqual([]);
    expect(opts.skills).toEqual([]);
    expect(opts.persistSession).toBe(false);
    expect(opts.additionalDirectories).toBeUndefined();
  });

  it("runs in the small environment, not the server's own", () => {
    expect(opts.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(opts.env!.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat-test");
  });

  it("with no tools of ours there is no server at all", () => {
    const plain = lockedOptions({ model: "m", system: ["s"], prompt: "p" }, TOKEN);
    expect(plain.tools).toEqual([]);
    expect(plain.mcpServers).toEqual({});
    expect(plain.allowedTools).toEqual([]);
  });
});

describe("what Claude Code reports as it starts", () => {
  const ours = ["search_titles", "remember"];

  it("passes with exactly our tools and the subscription", () => {
    expect(() => checkStart({ tools: ["mcp__mox__search_titles", "mcp__mox__remember"], apiKeySource: "none" }, ours)).not.toThrow();
    expect(() => checkStart({ tools: [], apiKeySource: "none" }, [])).not.toThrow();
  });

  it("stops the run on any built-in tool", () => {
    for (const builtin of ["Bash", "Read", "Write", "Edit", "WebFetch", "WebSearch", "Task", "Skill"]) {
      expect(() => checkStart({ tools: ["mcp__mox__search_titles", builtin], apiKeySource: "none" }, ours)).toThrow(builtin);
    }
  });

  it("stops the run on a tool from any other server, or one of ours it was not given", () => {
    expect(() => checkStart({ tools: ["mcp__other__search_titles"], apiKeySource: "none" }, ours)).toThrow();
    expect(() => checkStart({ tools: ["mcp__mox__forget"], apiKeySource: "none" }, ours)).toThrow();
  });

  it("stops the run when one of ours did not make it in", () => {
    expect(() => checkStart({ tools: ["mcp__mox__search_titles"], apiKeySource: "none" }, ours)).toThrow("remember");
  });

  it("stops the run when it signed in with an API key instead of the subscription", () => {
    expect(() => checkStart({ tools: [], apiKeySource: "ANTHROPIC_API_KEY" }, [])).toThrow("ANTHROPIC_API_KEY");
    expect(() => checkStart({ tools: [], apiKeySource: "apiKeyHelper" }, [])).toThrow();
  });

  it("names tools both ways round", () => {
    expect(bareToolName(toolId("show_titles"))).toBe("show_titles");
    expect(bareToolName("show_titles")).toBe("show_titles");
  });
});
