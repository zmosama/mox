/**
 * Arabic as people type it, not as it is spelt: hamza seats, taa marbuta and
 * alif maqsura fold to their plain letters, and harakat and tatweel go. Used
 * on both sides of a search, so "الفيل الازرق" finds "الفيل الأزرق".
 */
export function foldArabic(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}
