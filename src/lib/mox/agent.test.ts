import { describe, expect, it } from "vitest";
import { promptWith } from "./agent";

describe("the conversation as one prompt (subscription)", () => {
  it("is just his message when there is nothing before it", () => {
    expect(promptWith([], "رشحلي فيلم")).toBe("رشحلي فيلم");
  });

  it("puts earlier lines above his new message, oldest first, each marked with who said it", () => {
    const p = promptWith([{ role: "user", content: "I loved Heat" }, { role: "assistant", content: "Then try Thief." }], "Something newer?");
    expect(p.indexOf("Him: I loved Heat")).toBeLessThan(p.indexOf("You (MOX): Then try Thief."));
    expect(p.indexOf("</conversation_so_far>")).toBeLessThan(p.indexOf("Something newer?"));
    expect(p.endsWith("Something newer?")).toBe(true);
  });
});
