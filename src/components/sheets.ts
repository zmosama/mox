/**
 * Which sheet is on top. A title opens a person, who opens another title, and
 * each is its own sheet listening for Escape — without this, one press closed
 * the whole pile instead of just the one in front.
 */
const stack: symbol[] = [];

export function pushSheet(): symbol {
  const id = Symbol("sheet");
  stack.push(id);
  return id;
}

export function popSheet(id: symbol) {
  const i = stack.lastIndexOf(id);
  if (i >= 0) stack.splice(i, 1);
}

export const isTopSheet = (id: symbol) => stack[stack.length - 1] === id;
