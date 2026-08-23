import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export type ServiceChoice = {
  providerId: number;
  name: string;
  logo: string | null;
  selected: boolean;
};

/**
 * Has this account chosen its services yet?
 *
 * An account that has not is shown everything rather than nothing, so this is
 * what tells the board to point them at the picker — otherwise "on your
 * services" quietly means "on every service" and nobody ever finds the page.
 */
export function hasPickedServices(userId: number): boolean {
  return Boolean(
    db
      .select({ providerId: schema.userServices.providerId })
      .from(schema.userServices)
      .where(eq(schema.userServices.userId, userId))
      .get(),
  );
}

/** The install's service catalogue, annotated for one viewer. */
export function serviceChoices(userId: number): ServiceChoice[] {
  const selected = new Set(
    db
      .select({ providerId: schema.userServices.providerId })
      .from(schema.userServices)
      .where(eq(schema.userServices.userId, userId))
      .all()
      .map((r) => r.providerId),
  );

  /* What you already pay for comes first, the rest in TMDB's own order.
     Straight priority order buried Shahid VIP and OSN+ — the ones actually in
     use here — below a long tail of niche catalogues. */
  return db
    .select({
      providerId: schema.services.providerId,
      name: schema.services.name,
      logo: schema.services.logo,
    })
    .from(schema.services)
    .orderBy(asc(schema.services.priority), asc(schema.services.name))
    .all()
    .map((service) => ({ ...service, selected: selected.has(service.providerId) }))
    .sort((a, b) => Number(b.selected) - Number(a.selected));
}

/** Replace only this viewer's subscriptions, after validating the catalogue ids. */
export function replaceUserServices(userId: number, providerIds: number[]) {
  const ids = [...new Set(providerIds)];
  const known = ids.length
    ? db
        .select({ providerId: schema.services.providerId })
        .from(schema.services)
        .where(inArray(schema.services.providerId, ids))
        .all()
    : [];

  if (known.length !== ids.length) {
    return { ok: false as const, error: "Unknown streaming service." };
  }

  db.transaction((tx) => {
    tx.delete(schema.userServices).where(eq(schema.userServices.userId, userId)).run();
    if (ids.length) {
      tx.insert(schema.userServices)
        .values(ids.map((providerId) => ({ userId, providerId })))
        .run();
    }
  });

  return { ok: true as const };
}
