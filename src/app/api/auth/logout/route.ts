import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearedCookie, destroySession, requestUsesHttps, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) destroySession(id);

  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(clearedCookie(requestUsesHttps(req)));
  return res;
}
