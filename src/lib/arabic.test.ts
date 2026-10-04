import { describe, expect, it } from "vitest";
import { foldArabic } from "./arabic";

describe("foldArabic", () => {
  it("folds the spellings people do not type", () => {
    expect(foldArabic("الفيل الأزرق")).toBe("الفيل الازرق");
    expect(foldArabic("مدرسة المشاغبين")).toBe("مدرسه المشاغبين");
    expect(foldArabic("مُصْطَفَى")).toBe("مصطفي");
    expect(foldArabic("The Dark Knight")).toBe("The Dark Knight");
  });
});
