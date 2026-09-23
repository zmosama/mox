import { describe, expect, it } from "vitest";
import { sniffImage } from "./avatars";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe("sniffImage", () => {
  it("knows JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe("image/png");
    expect(sniffImage(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects anything else, whatever it claims to be", () => {
    expect(sniffImage(ascii("<svg xmlns="))).toBeNull();
    expect(sniffImage(ascii("GIF89a"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
