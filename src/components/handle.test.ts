/**
 * The sign-up form turns a name into a handle rather than refusing it.
 *
 * Somebody typed "Ahmed Fouad" into the username field — the obvious thing to
 * do when the field above the display name is called "Username" — and was told
 * the rule only after pressing the button. These are the shapes a real name
 * arrives in.
 */
import { describe, expect, it } from "vitest";
import { toHandle } from "./LoginForm";
import { USERNAME_RE } from "@/lib/users";

const cases: [input: string, expected: string][] = [
  ["Ahmed Fouad", "ahmed_fouad"],
  // A trailing separator survives on purpose: stripping it as you type
  // would make an underscore impossible to enter by hand.
  ["  Ahmed   Fouad  ", "ahmed_fouad_"],
  ["ahmed_", "ahmed_"],
  ["Nadia Kamal", "nadia_kamal"],
  ["JoséGarcía", "josegarcia"],
  ["nadia", "nadia"],
  ["Ahmed.Fouad", "ahmed.fouad"],
  ["--leading", "leading"],
  ["A", "a"],
];

describe("turning a name into a handle", () => {
  for (const [input, expected] of cases) {
    it(`"${input}" -> "${expected}"`, () => {
      expect(toHandle(input)).toBe(expected);
    });
  }

  it("produces something the server will accept", () => {
    for (const [input] of cases) {
      const handle = toHandle(input);
      if (handle.length >= 3) {
        expect(USERNAME_RE.test(handle), `${input} -> ${handle}`).toBe(true);
      }
    }
  });

  it("never exceeds the length the server allows", () => {
    expect(toHandle("x".repeat(200))).toHaveLength(32);
  });

  it("comes back empty for a name with no Latin characters, rather than as junk", () => {
    expect(toHandle("أحمد فؤاد")).toBe("");
  });
});
