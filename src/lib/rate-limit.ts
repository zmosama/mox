type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Small in-process fixed-window limiter, suitable for mox's single Node process
 * on echo. It intentionally needs no external service. A restart clears the
 * counters; database authorization remains the actual security boundary.
 */
export function takeRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  buckets.set(key, bucket);

  // Opportunistic cleanup keeps spoofed keys from growing the map forever.
  if (buckets.size > 2_000) {
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(candidate);
    }
  }

  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Best available address after echo's reverse proxy, with a safe local fallback. */
export function clientAddress(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}
