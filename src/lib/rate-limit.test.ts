import { describe, expect, it } from "vitest";
import { clientAddress, takeRequest } from "./rate-limit";

describe("authentication rate limiting", () => {
  it("blocks a key after its fixed-window allowance", () => {
    const key = `test:${Math.random()}`;
    expect(takeRequest(key, 2, 60_000).allowed).toBe(true);
    expect(takeRequest(key, 2, 60_000).allowed).toBe(true);
    const blocked = takeRequest(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("uses the first reverse-proxy address", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.4, 127.0.0.1" },
    });
    expect(clientAddress(req)).toBe("203.0.113.4");
  });
});
