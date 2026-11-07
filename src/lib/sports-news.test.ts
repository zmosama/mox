import { describe, expect, it } from "vitest";
import { acceptable, headlineWords, MIXED_SCRIPT, overlap } from "./sports-news";

describe("acceptable translation", () => {
  it("takes clean Arabic", () => {
    expect(acceptable({ title_ar: "نوريس الأسرع في التجارب الحرة الأولى", summary_ar: "تصدّر لاندو نوريس الجلسة." })).toBe(true);
  });

  it("refuses Latin letters glued to Arabic ones — the translator's slip", () => {
    expect(MIXED_SCRIPT.test("لeclerc")).toBe(true);
    expect(acceptable({ title_ar: "فيراري في إنterlagos", summary_ar: "…" })).toBe(false);
  });

  it("lets a model code or a lap time stand apart from the Arabic", () => {
    expect(acceptable({ title_ar: "سيارة فيراري SF-26 بطيئة", summary_ar: "سجّل 1:10.763 دقيقة." })).toBe(true);
  });

  it("refuses an English title, an empty one and a non-string", () => {
    expect(acceptable({ title_ar: "Norris fastest in FP1", summary_ar: "" })).toBe(false);
    expect(acceptable({ title_ar: "", summary_ar: "نص" })).toBe(false);
    expect(acceptable({ title_ar: 3, summary_ar: "نص" })).toBe(false);
  });
});

describe("the same story from Motorsport.com and Autosport", () => {
  it("matches a headline reworded with a full name", () => {
    const a = headlineWords("Herta qualifies for F1 superlicence as Bottas stays bullish on 2027 seat");
    const b = headlineWords("Colton Herta qualifies for superlicence, Bottas bullish on 2027 seat");
    expect(overlap(a, b)).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps two different stories apart", () => {
    const a = headlineWords("Norris fastest in opening practice from new champion Antonelli");
    const b = headlineWords("Exhausted Russell set for Brazilian grid penalty");
    expect(overlap(a, b)).toBeLessThan(0.75);
  });
});
