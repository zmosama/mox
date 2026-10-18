import { describe, expect, it } from "vitest";
import { matchQuality, rankResults } from "./search-rank";

describe("search order", () => {
  const typed = "the love h";
  const results = [
    { title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", year: 1964, votes: 540_000 },
    { title: "The Cook, the Thief, His Wife & Her Lover", year: 1989, votes: 45_000 },
    { title: "The Love Hypothesis", year: 2026, votes: 3_000, mine: true },
    { title: "The Human Condition I: No Greater Love", year: 1959, votes: 20_000 },
    { title: "Love Has Won: The Cult of Mother God", year: 2023, votes: 2_000 },
  ];

  it("puts the title being typed first", () => {
    expect(rankResults(results, typed)[0].title).toBe("The Love Hypothesis");
  });

  it("ranks loose word matches below phrase matches", () => {
    expect(matchQuality("Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", typed)).toBeLessThan(
      matchQuality("The Love Hypothesis", typed),
    );
  });

  it("an exact name still beats a newer sequel", () => {
    const order = rankResults(
      [
        { title: "The Dark Knight Rises", year: 2012, votes: 1_900_000 },
        { title: "The Dark Knight", year: 2008, votes: 3_000_000 },
      ],
      "the dark knight",
    );
    expect(order[0].title).toBe("The Dark Knight");
  });

  it("among equal matches, new and on your services first", () => {
    const order = rankResults(
      [
        { title: "Love Actually", year: 2003, votes: 550_000 },
        { title: "Love Island", year: 2026, votes: 1_000, mine: true },
      ],
      "love",
    );
    expect(order[0].title).toBe("Love Island");
  });

  it("a famous show beats an obscure exact name", () => {
    const order = rankResults(
      [
        { title: "Stranger", year: 2025, votes: 400 },
        { title: "Stranger Things", year: 2016, votes: 1_400_000, mine: true },
      ],
      "stranger",
    );
    expect(order[0].title).toBe("Stranger Things");
  });

  it("finds a name typed without its The", () => {
    expect(matchQuality("The Love Hypothesis", "love hyp")).toBe(4);
  });
});
