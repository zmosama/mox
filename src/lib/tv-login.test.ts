import { describe, expect, it } from "vitest";
import { normalizeCode } from "./tv-login";

describe("the code an Apple TV shows", () => {
  it("is read however it was typed", () => {
    expect(normalizeCode("abc-234")).toBe("ABC234");
    expect(normalizeCode(" ABC 234 ")).toBe("ABC234");
  });

  it("is refused when it could not be one", () => {
    expect(normalizeCode("ABC23")).toBeNull(); // too short
    expect(normalizeCode("ABC2340")).toBeNull(); // too long
    expect(normalizeCode("ABCO23")).toBeNull(); // O is never drawn
    expect(normalizeCode(undefined)).toBeNull();
  });
});
