import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, PrefsPatch, webTabs } from "./prefs";

describe("parsePrefs", () => {
  it("gives the defaults for nothing stored, or for nonsense", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
  });

  it("keeps each valid field and defaults only the broken one", () => {
    const prefs = parsePrefs(JSON.stringify({ tabs: ["f1", "today"], newsLangs: ["xx"], f1Shield: false }));
    expect(prefs.tabs).toEqual(["f1", "today"]);
    expect(prefs.newsLangs).toEqual(DEFAULT_PREFS.newsLangs);
    expect(prefs.f1Shield).toBe(false);
  });

  it("refuses an unknown tab rather than drawing a button to nowhere", () => {
    expect(parsePrefs(JSON.stringify({ tabs: ["today", "casino"] })).tabs).toEqual(DEFAULT_PREFS.tabs);
  });
});

describe("PrefsPatch", () => {
  it("allows at most four tabs, and at least one", () => {
    expect(PrefsPatch.safeParse({ tabs: ["today", "news", "library", "f1", "tasks"] }).success).toBe(false);
    expect(PrefsPatch.safeParse({ tabs: [] }).success).toBe(false);
    expect(PrefsPatch.safeParse({ tabs: ["f1"] }).success).toBe(true);
  });
});

describe("webTabs", () => {
  it("leaves out the tabs only the app can show", () => {
    expect(webTabs({ ...DEFAULT_PREFS, tabs: ["today", "calendar", "f1", "tasks"] })).toEqual(["today", "f1"]);
  });
});
