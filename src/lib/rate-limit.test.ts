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

  it("behind a Cloudflare Tunnel, believes Cloudflare and not a forged header", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 198.51.100.7", "cf-connecting-ip": "198.51.100.7" },
    });
    process.env.MOX_TRUST_CF = "1";
    try {
      expect(clientAddress(req)).toBe("198.51.100.7");
    } finally {
      delete process.env.MOX_TRUST_CF;
    }
    // Without the setting the header means nothing: anyone could send it.
    expect(clientAddress(req)).toBe("1.2.3.4");
  });
});
