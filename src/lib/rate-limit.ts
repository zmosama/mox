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

/**
 * Who is asking, for the per-visitor limits.
 *
 * Behind a Cloudflare Tunnel with nothing else in front (MOX_TRUST_CF=1, as
 * on the TrueNAS, where the port listens only on localhost and only the tunnel
 * reaches it), Cloudflare's own CF-Connecting-IP is the visitor. The first
 * entry of X-Forwarded-For is not: Cloudflare appends to whatever the client
 * sent, so a client could name any address there and never be limited. Behind
 * a proxy that rewrites X-Forwarded-For itself (Caddy on the VPS did), that
 * header is the visitor.
 */
export function clientAddress(req: Request) {
  const viaCloudflare = process.env.MOX_TRUST_CF === "1" ? req.headers.get("cf-connecting-ip")?.trim() : null;
  return (
    viaCloudflare ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}
