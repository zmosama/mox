/** Join class names, dropping anything falsy. */
export const cn = (...parts: (string | number | false | null | undefined)[]) =>
  parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");
