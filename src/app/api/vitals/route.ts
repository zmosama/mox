import { clientAddress, takeRequest } from "@/lib/rate-limit";
import { recordVital, VitalInput } from "@/lib/vitals";

/** One Core Web Vital from a browser (WebVitals.tsx). Signed out too: the site works signed out. */
export async function POST(req: Request) {
  // Our own pages only. A browser always says where a beacon came from; this
  // keeps out casual noise — the route list in VitalInput keeps out the rest.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  if (!takeRequest(`vitals:${clientAddress(req)}`, 20, 60_000).allowed) return new Response(null, { status: 429 });
  const parsed = VitalInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  recordVital(parsed.data);
  return new Response(null, { status: 204 });
}
