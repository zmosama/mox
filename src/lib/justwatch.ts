/**
 * Reading prices and arrivals out of a JustWatch page.
 *
 * TMDB knows a film is on Apple's store and nothing about what it costs, which
 * is the one fact that decides whether it is worth buying tonight. JustWatch
 * prints it, and — usefully — not only as text: every offer link carries a
 * base64 payload with the provider, the monetization type, the currency and the
 * price in cents. Parsing that is far steadier than reading rendered markup,
 * because it is the site's own data rather than its current layout.
 *
 * Kept separate from the fetching so it can be tested against a saved page.
 */

/** One offer as JustWatch describes it in a clickout payload. */
export type Offer = {
  providerId: number;
  monetizationType: string;
  currency: string | null;
  priceCent: number | null;
};

export type Price = {
  rentCent: number | null;
  buyCent: number | null;
  currency: string | null;
};

/** Every clickout payload on the page, decoded. Malformed ones are skipped. */
export function parseOffers(html: string): Offer[] {
  const out: Offer[] = [];

  for (const match of html.matchAll(/cx=([A-Za-z0-9_\-%]+)/g)) {
    let decoded: unknown;
    try {
      let raw = decodeURIComponent(match[1]);
      raw += "=".repeat((4 - (raw.length % 4)) % 4);
      decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      continue; // not a payload, or truncated in the markup
    }

    const data = (decoded as { data?: { data?: Record<string, unknown> }[] })?.data;
    if (!Array.isArray(data)) continue;

    for (const entry of data) {
      const c = entry?.data;
      if (!c || typeof c.monetizationType !== "string") continue;
      if (typeof c.providerId !== "number") continue;
      out.push({
        providerId: c.providerId,
        monetizationType: c.monetizationType,
        currency: typeof c.currency === "string" ? c.currency : null,
        priceCent: typeof c.priceCent === "number" ? c.priceCent : null,
      });
    }
  }
  return out;
}

/**
 * The cheapest rent and buy for one provider.
 *
 * Cheapest rather than first: the same film is offered in SD, HD and 4K at
 * different prices and the page lists them in no order worth relying on. What
 * the card should say is what it costs to watch this at all.
 */
export function priceFor(html: string, providerId: number): Price | null {
  const mine = parseOffers(html).filter(
    (o) => o.providerId === providerId && o.priceCent != null,
  );
  if (!mine.length) return null;

  const cheapest = (kind: string) => {
    const of = mine.filter((o) => o.monetizationType.toUpperCase() === kind);
    return of.length ? Math.min(...of.map((o) => o.priceCent as number)) : null;
  };

  return {
    rentCent: cheapest("RENT"),
    buyCent: cheapest("BUY"),
    currency: mine.find((o) => o.currency)?.currency ?? null,
  };
}

/**
 * Film slugs and titles from a provider's "new releases" page.
 *
 * Only what is needed to attach a slug to a film mox already knows arrived:
 * the dates come from mox's own comparison of the shelf, so nothing here has to
 * agree with JustWatch about when anything landed.
 */
export function parseArrivals(html: string): { slug: string; title: string }[] {
  const out = new Map<string, string>();
  const link = /href="\/[a-z]{2}\/movie\/([a-z0-9-]+)"/g;

  /* The title is the poster's alt text, and the poster is several elements
     deep — a <picture> with its <source> variants sits between the two. So the
     search runs forward from the link rather than expecting the image next to
     it, and stops at the following link so a missing alt cannot borrow the next
     film's title. */
  const links = [...html.matchAll(link)];
  for (const [i, m] of links.entries()) {
    const from = m.index + m[0].length;
    const to = links[i + 1]?.index ?? Math.min(from + 3000, html.length);
    const alt = /\balt="([^"]{1,200})"/.exec(html.slice(from, to));
    if (alt && !out.has(m[1])) out.set(m[1], alt[1]);
  }
  return [...out].map(([slug, title]) => ({ slug, title }));
}

/** "EGP", 2999 -> "EGP 29.99". Cents are how JustWatch reports every price. */
export const formatPrice = (cent: number, currency: string | null) =>
  `${currency ? `${currency} ` : ""}${(cent / 100).toFixed(2)}`;
