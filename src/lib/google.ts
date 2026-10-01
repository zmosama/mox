/**
 * Google sign-in, by ID token alone.
 *
 * The site and the app each get an ID token from Google and post it here; this
 * asks Google whether it is genuine and for whom. No client secret exists
 * anywhere in mox — the token flow does not need one — so there is none to
 * leak from a public repository.
 *
 * Google's tokeninfo endpoint checks the signature and expiry itself. What it
 * cannot know is which app the token was issued to, so `aud` is checked here
 * against our own client IDs: a token minted for someone else's app must never
 * sign anyone in to this one.
 */
export type GoogleProfile = { sub: string; email: string; name: string | null };

/** The web and iOS client IDs, comma-separated. Public values, not secrets. */
export function googleClientIds(): string[] {
  return (process.env.GOOGLE_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function verifyIdToken(idToken: string): Promise<GoogleProfile | null> {
  const ids = googleClientIds();
  if (!ids.length) return null;
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const t = (await res.json().catch(() => null)) as Record<string, string> | null;
  if (!t) return null;
  if (!ids.includes(t.aud)) return null;
  if (t.iss !== "accounts.google.com" && t.iss !== "https://accounts.google.com") return null;
  if (Number(t.exp) * 1000 < Date.now()) return null;
  // An unverified address could be anyone's, and an address links accounts.
  if (t.email_verified !== "true" || !t.email || !t.sub) return null;
  return { sub: t.sub, email: t.email, name: t.name ?? null };
}
