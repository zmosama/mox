import { describe, expect, it } from "vitest";
import { pageParam, slice } from "./paging";

const titles = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("slice", () => {
  it("splits a full TMDB page into two of ten", () => {
    expect(slice(titles(20), 1, 5)).toEqual({ items: titles(10), next: 2 });
    expect(slice(titles(20), 2, 5)).toEqual({ items: titles(20).slice(10), next: 3 });
  });

  it("skips the empty second half when a page had ten titles or fewer", () => {
    expect(slice(titles(8), 1, 5)).toEqual({ items: titles(8), next: 3 });
  });

  it("stops at TMDB's last page", () => {
    expect(slice(titles(20), 1, 1).next).toBe(2);
    expect(slice(titles(20), 2, 1).next).toBeNull();
    expect(slice(titles(6), 5, 3).next).toBeNull();
  });
});

describe("pageParam", () => {
  it("falls back to the first page on anything odd", () => {
    expect(pageParam(null)).toBe(1);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("2.5")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam("7")).toBe(7);
  });
});
