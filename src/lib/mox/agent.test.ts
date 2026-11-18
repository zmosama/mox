import { describe, expect, it } from "vitest";
import { promptWith } from "./agent";

describe("the conversation as one prompt (subscription)", () => {
  it("is his message under one line of framing when there is nothing before it", () => {
    expect(promptWith([], "رشحلي فيلم").endsWith("رشحلي فيلم")).toBe(true);
  });

  it("never opens with his own words — a leading slash would be read as a Claude Code command", () => {
    expect(promptWith([], "/help")).not.toMatch(/^\//);
    expect(promptWith([{ role: "user", content: "/clear" }], "/help")).not.toMatch(/^\//);
  });

  it("puts earlier lines above his new message, oldest first, each marked with who said it", () => {
    const p = promptWith([{ role: "user", content: "I loved Heat" }, { role: "assistant", content: "Then try Thief." }], "Something newer?");
    expect(p.indexOf("Him: I loved Heat")).toBeLessThan(p.indexOf("You (MOX): Then try Thief."));
    expect(p.indexOf("</conversation_so_far>")).toBeLessThan(p.indexOf("Something newer?"));
    expect(p.endsWith("Something newer?")).toBe(true);
  });
});
