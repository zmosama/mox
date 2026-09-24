import { describe, expect, it } from "vitest";
import {
  buildMatchers, isList, namePattern, onTopic, parseFeed, parseFeedDate, scoreItem, thumbnail,
} from "./news-rules";

const FEED = `<?xml version="1.0"?><rss><channel>
<item>
  <title>&#8216;Silo&#8217; Season 3 Sets Premiere Date at Apple TV</title>
  <link>https://variety.com/2026/tv/news/silo-season-3-1236870000/</link>
  <pubDate>Thu, 24 Sep 2026 11:00:00 +0000</pubDate>
  <category><![CDATA[TV]]></category>
  <category><![CDATA[Silo]]></category>
  <description><![CDATA[Apple TV has dated the third season of &#8220;Silo&#8221; [&#8230;]]]></description>
  <media:content url="https://variety.com/wp-content/uploads/2026/09/silo.jpg" medium="image"></media:content>
</item>
<item>
  <title><![CDATA[ريد فلاج يقترب من 26 مليونا إيرادات]]></title>
  <link>https://www.youm7.com/story/2026/9/24/1</link>
  <pubDate>الخميس، 24 سبتمبر 2026 01:00 م</pubDate>
  <enclosure url="https://img.youm7.com/a.jpg" type="image/jpeg" />
</item>
<item><title>No link here</title></item>
</channel></rss>`;

describe("parseFeed", () => {
  const items = parseFeed(FEED);

  it("reads titles, links, categories and pictures, and skips items without a link", () => {
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("‘Silo’ Season 3 Sets Premiere Date at Apple TV");
    expect(items[0].url).toBe("https://variety.com/2026/tv/news/silo-season-3-1236870000/");
    expect(items[0].categories).toEqual(["TV", "Silo"]);
    expect(items[0].image).toBe("https://variety.com/wp-content/uploads/2026/09/silo.jpg");
    expect(items[0].summary).toBe("Apple TV has dated the third season of “Silo”…");
    expect(items[1].image).toBe("https://img.youm7.com/a.jpg");
  });

  it("reads RFC 822 dates and Youm7's Arabic ones, in Cairo time", () => {
    expect(items[0].publishedAt).toBe(Date.UTC(2026, 8, 24, 11, 0) / 1000);
    // 1:00 pm Cairo (UTC+3) is 10:00 UTC.
    expect(items[1].publishedAt).toBe(Date.UTC(2026, 8, 24, 10, 0) / 1000);
    expect(parseFeedDate("الخميس، 24 سبتمبر 2026 11:55 ص")).toBe(Date.UTC(2026, 8, 24, 8, 55) / 1000);
    expect(parseFeedDate("nonsense")).toBeNull();
  });
});

describe("onTopic", () => {
  it("keeps the trades' film and TV desks and drops music and theatre", () => {
    expect(onTopic({ url: "https://variety.com/2026/tv/news/x/", title: "x", summary: null }, "en")).toBe(true);
    expect(onTopic({ url: "https://variety.com/2026/music/news/x/", title: "x", summary: null }, "en")).toBe(false);
    expect(onTopic({ url: "https://deadline.com/2026/09/theater/x/", title: "x", summary: null }, "en")).toBe(false);
  });

  it("wants an Arabic arts story to name the screen", () => {
    expect(onTopic({ url: "https://youm7.com/1", title: "إيرادات فيلم جديد", summary: null }, "ar")).toBe(true);
    expect(onTopic({ url: "https://youm7.com/2", title: "انتكاسة صحية لفنان", summary: null }, "ar")).toBe(false);
    expect(onTopic({ url: "https://youm7.com/3", title: "الأوبرا تهدى النسخة 34 من مهرجان الموسيقى العربية", summary: null }, "ar")).toBe(false);
    expect(onTopic({ url: "https://youm7.com/4", title: "مهرجان الجونة السينمائي يعلن أفلامه", summary: null }, "ar")).toBe(true);
  });
});

describe("namePattern", () => {
  it("only takes a one-word title in quotation marks", () => {
    const silo = namePattern("Silo", true)!;
    expect(silo.test("‘Silo’ Season 3")).toBe(true);
    expect(silo.test("grain silo fire")).toBe(false);
    expect(silo.test("Silo season 3")).toBe(false);
  });

  it("matches longer titles and names as whole, case-sensitive phrases", () => {
    const p = namePattern("Tom Hardy", false)!;
    expect(p.test("Tom Hardy joins cast")).toBe(true);
    expect(p.test("Tom Hardyman")).toBe(false);
    expect(namePattern("Slow Horses", true)!.test("slow horses")).toBe(false);
  });

  it("matches Arabic names as words, not inside other words", () => {
    const p = namePattern("كريم عبد العزيز", false)!;
    expect(p.test("رحلة كريم عبد العزيز ومعتز")).toBe(true);
    expect(namePattern("ريد", true)).toBeNull();
  });
});

describe("scoreItem", () => {
  const matchers = buildMatchers([
    { name: "Silo", kind: "follow" },
    { name: "Se7en", kind: "love" },
    { name: "Shutter Island", kind: "like" },
    { name: "Madame Web", kind: "avoid" },
  ]);

  it("says why a story is here, strongest reason first", () => {
    const s = scoreItem({ title: "‘Silo’ Season 3 dated", summary: null, categories: [] }, matchers);
    expect(s.score).toBe(5);
    expect(s.strong).toBe(true);
    expect(s.reasons).toEqual(["You follow Silo"]);
  });

  it("counts the feed's own category as a match, quotes or not", () => {
    const s = scoreItem({ title: "Apple renews its dystopia", summary: null, categories: ["Silo"] }, matchers);
    expect(s.score).toBe(5);
  });

  it("marks loves and likes as not strong, so a list of them stays out of your stories", () => {
    const title = "6 Most Perfect Thriller Movies of the Last 50 Years, Ranked";
    const s = scoreItem({ title, summary: "From ‘Se7en’ to Shutter Island", categories: [] }, matchers);
    expect(s.score).toBe(5);
    expect(s.strong).toBe(false);
    expect(isList({ title })).toBe(true);
  });

  it("drops a story about something you disliked unless it is about something you follow", () => {
    expect(scoreItem({ title: "Madame Web sequel", summary: null, categories: [] }, matchers).avoid).toBe(true);
    expect(scoreItem({ title: "Madame Web and ‘Silo’", summary: null, categories: [] }, matchers).avoid).toBe(false);
  });
});

describe("isList", () => {
  it("tells lists from news", () => {
    expect(isList({ title: "The 15 Best Netflix Original Comedy Movies, Ranked" })).toBe(true);
    expect(isList({ title: "8 Great Books Where Every Chapter Is Perfect" })).toBe(true);
    expect(isList({ title: "‘Coyote vs. Acme’ Officially Hits Streaming in 6 Days" })).toBe(false);
    expect(isList({ title: "20 Years Later, Julianne Moore's Sci-Fi Thriller Still Holds Up" })).toBe(false);
  });
});

describe("thumbnail", () => {
  it("asks the trades' image servers for a small picture", () => {
    expect(thumbnail("https://variety.com/wp-content/uploads/2026/01/a.jpg")).toBe(
      "https://variety.com/wp-content/uploads/2026/01/a.jpg?w=480",
    );
    expect(thumbnail("https://img.youm7.com/a.jpg")).toBe("https://img.youm7.com/a.jpg");
    expect(thumbnail("https://x.com/a.jpg?w=100")).toBe("https://x.com/a.jpg?w=100");
    expect(thumbnail(null)).toBeNull();
  });
});
