import { describe, expect, it } from "vitest";
import { formatPrice, parseArrivals, parseClickouts, parseOffers, priceFor } from "./justwatch";

/** A clickout link the way JustWatch writes one: the offer is base64 in `cx`. */
const offerLink = (offer: Record<string, unknown>) => {
  const payload = {
    data: [
      { schema: "iglu:com.justwatch/clickout_context/jsonschema/1-10-0", data: offer },
      { schema: "iglu:com.justwatch/link_context/jsonschema/1-0-0", data: { link: {} } },
    ],
  };
  const cx = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `<a href="https://e.justwatch.com/a?r=https%3A%2F%2Ftv.apple.com&cx=${cx}">buy</a>`;
};

const apple = (monetizationType: string, priceCent: number, presentationType = "HD") =>
  offerLink({ provider: "Apple TV Store", providerId: 2, monetizationType,
              presentationType, currency: "EGP", priceCent });

describe("reading offers off a JustWatch page", () => {
  it("decodes what an offer costs", () => {
    const offers = parseOffers(apple("RENT", 2999));
    expect(offers).toEqual([
      { providerId: 2, monetizationType: "RENT", currency: "EGP", priceCent: 2999 },
    ]);
  });

  it("takes the cheapest of the qualities on offer", () => {
    /* The same film is sold in SD, HD and 4K at different prices and listed in
       no useful order. What the card should say is what it costs at all. */
    const html = apple("RENT", 4999, "_4K") + apple("RENT", 2999) + apple("BUY", 9999);
    expect(priceFor(html, 2)).toEqual({ rentCent: 2999, buyCent: 9999, currency: "EGP" });
  });

  it("reports buy-only, which most new arrivals are", () => {
    expect(priceFor(apple("BUY", 14999), 2)).toEqual({
      rentCent: null, buyCent: 14999, currency: "EGP",
    });
  });

  it("ignores other providers on the same page", () => {
    const other = offerLink({ provider: "JustWatch TV", providerId: 2285,
                              monetizationType: "FREE", currency: null, priceCent: null });
    expect(priceFor(other + apple("BUY", 9999), 2)?.buyCent).toBe(9999);
    expect(priceFor(other, 2)).toBeNull();
  });

  it("says nothing rather than guessing when there is no offer", () => {
    expect(priceFor("<a href='/eg/movie/x'>x</a>", 2)).toBeNull();
    expect(parseOffers("cx=not-base64")).toEqual([]);
    expect(parseOffers("")).toEqual([]);
  });

  it("formats cents the way a price is written", () => {
    expect(formatPrice(2999, "EGP")).toBe("EGP 29.99");
    expect(formatPrice(14999, null)).toBe("149.99");
  });
});

describe("reading arrivals off a provider page", () => {
  /* The title is the poster's alt text and the poster is several elements down,
     inside a <picture> with its <source> variants. */
  const card = (slug: string, title: string) =>
    `<a href="/eg/movie/${slug}"><div><span class="title-poster">` +
    `<svg><path/></svg><picture><source type="image/avif" data-srcset="x.avif">` +
    `<img alt="${title}" src="x.jpg"></picture></span></div></a>`;

  it("pairs each slug with its title", () => {
    const html = card("sliding-doors", "أبواب منزلقة") + card("the-cable-guy", "The Cable Guy");
    expect(parseArrivals(html)).toEqual([
      { slug: "sliding-doors", title: "أبواب منزلقة" },
      { slug: "the-cable-guy", title: "The Cable Guy" },
    ]);
  });

  it("will not let a film borrow the next one's title", () => {
    const html = `<a href="/eg/movie/no-poster"></a>` + card("the-fires", "The Fires");
    expect(parseArrivals(html)).toEqual([{ slug: "the-fires", title: "The Fires" }]);
  });

  it("keeps the first sighting of a slug listed twice", () => {
    const html = card("keeper", "Keeper") + card("keeper", "Keeper again");
    expect(parseArrivals(html)).toEqual([{ slug: "keeper", title: "Keeper" }]);
  });
});

describe("clickout destinations", () => {
  /** A real payload from TMDB's watch page: Shahid VIP, One Piece episode 1076. */
  const payload =
    "eyJzY2hlbWEiOiJpZ2x1OmNvbS5zbm93cGxvd2FuYWx5dGljcy5zbm93cGxvdy9jb250ZXh0cy9qc29uc2NoZW1hLzEtMC0wIiwiZGF0YSI6W3sic2NoZW1hIjoiaWdsdTpjb20uanVzdHdhdGNoL2NsaWNrb3V0X2NvbnRleHQvanNvbnNjaGVtYS8xLTMtMiIsImRhdGEiOnsicHJvdmlkZXIiOiJTaGFoaWQgVklQIiwibW9uZXRpemF0aW9uVHlwZSI6ImZsYXRyYXRlIiwicHJlc2VudGF0aW9uVHlwZSI6InNkIiwiY3VycmVuY3kiOiJFR1AiLCJwYXJ0bmVySWQiOjYsInByb3ZpZGVySWQiOjE3MTUsImNsaWNrb3V0VHlwZSI6Imp3LWNvbnRlbnQtcGFydG5lci1leHBvcnQtYXBpIn19XX0";
  const shahid =
    "https%3A%2F%2Fshahid.mbc.net%2Fen%2Fplayer%2Fepisodes%2FOne-Piece-season-1-episode-1076%2Fid-1023248";
  const anchor = (cx: string, r: string) =>
    `<a href="https://click.justwatch.com/a?cx=${cx}&r=${r}&uct_country=eg">`;

  it("reads the service's own URL out of the link", () => {
    const [offer] = parseClickouts(anchor(payload, shahid));
    expect(offer.providerId).toBe(1715);
    expect(offer.monetizationType).toBe("flatrate");
    expect(offer.url).toBe(
      "https://shahid.mbc.net/en/player/episodes/One-Piece-season-1-episode-1076/id-1023248",
    );
  });

  it("keeps one link per service, not one per quality", () => {
    // The same title is offered at hd and sd; both carry the same destination.
    expect(parseClickouts(anchor(payload, shahid) + anchor(payload, shahid))).toHaveLength(1);
  });

  it("refuses a destination that is not a link to the service", () => {
    expect(parseClickouts(anchor(payload, "javascript%3Aalert(1)"))).toEqual([]);
    expect(parseClickouts(anchor(payload, "%2Fsearch%3Fq%3Done"))).toEqual([]);
  });

  it("ignores anything that is not a clickout", () => {
    expect(parseClickouts('<a href="https://www.netflix.com/title/80107103">')).toEqual([]);
  });
});
