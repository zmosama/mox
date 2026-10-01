import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { deleteUser, revokeSessions, setAdmin, updateUser } from "@/lib/users";

const Body = z.object({
  userId: z.number().int().positive(),
  action: z.enum(["grantAdmin", "revokeAdmin", "delete", "signOutEverywhere", "update"]),
  /* Only read for "update". Absent means "leave it alone" — distinct from an
     empty string, which for a display name means "clear it". */
  username: z.string().optional(),
  displayName: z.string().max(60).optional(),
  password: z.string().optional(),
  email: z.string().max(254).optional(),
});

/**
 * Role changes and deletions.
 *
 * Every branch re-checks ownership inside the users module against the
 * database, so a stale session that was an owner's cannot act on that alone.
 */
export async function POST(req: Request) {
  const actor = await currentUser();
  if (!actor) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { userId, action, username, displayName, password, email } = parsed.data;
  const result =
    action === "grantAdmin"
      ? setAdmin(actor, userId, true)
      : action === "revokeAdmin"
        ? setAdmin(actor, userId, false)
        : action === "delete"
          ? deleteUser(actor, userId)
          : action === "update"
            ? await updateUser(actor, userId, { username, displayName, password, email })
            : revokeSessions(actor, userId);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
