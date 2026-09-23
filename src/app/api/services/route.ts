import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { replaceUserServices, serviceChoices } from "@/lib/services";

const Body = z.object({
  providerIds: z.array(z.number().int().positive()).max(50),
});

/** The install's services, marked with the ones this account pays for. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ services: serviceChoices(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const result = replaceUserServices(user.id, parsed.data.providerIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
