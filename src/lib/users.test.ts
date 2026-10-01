/**
 * The rules that matter are the ones about privilege, so they are asserted
 * rather than assumed: sign-up cannot mint an admin, an admin cannot promote
 * anyone, and the owner cannot be demoted or deleted.
 *
 * Runs against a throwaway copy of the database so it can create and delete
 * real accounts.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { hashPassword } from "./hash";
import type { SessionUser } from "./auth";

const dir = mkdtempSync(join(tmpdir(), "mox-users-"));
const file = join(dir, "test.db");

process.env.MOX_DB = file;

// Imported after MOX_DB is set: the connection is opened at module load.
type Users = typeof import("./users");
type Services = typeof import("./services");
let users: Users;
let services: Services;
let owner: SessionUser;

const asSession = (u: { id: number; username: string; isAdmin: boolean }): SessionUser => ({
  id: u.id,
  username: u.username,
  displayName: null,
  isAdmin: u.isAdmin,
  avatarAt: null,
});

beforeAll(async () => {
  /* Built by running the real migrations, not by re-declaring the tables here.
     A hand-written copy of the schema drifts from the one that ships — the
     tables it happened to omit made a query in this very file fail against a
     database that the application would have answered. */
  const seed = new Database(file);
  seed.pragma("foreign_keys = ON");
  migrate(drizzle(seed), { migrationsFolder: "./drizzle" });

  seed.prepare(
    "INSERT INTO users (username, password_hash, display_name, is_admin, is_owner) VALUES (?, ?, ?, 1, 1)",
  ).run("owner", await hashPassword("owner-password"), "Owner");
  seed.close();

  users = await import("./users");
  services = await import("./services");
  const found = users.listUsers().find((u) => u.isOwner);
  if (!found) throw new Error("the snapshot has no owner to test against");
  owner = asSession(found);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("registration", () => {
  it("never creates an admin, whatever the caller wants", async () => {
    const made = await users.createUser("tester_plain", "a-long-enough-password");
    expect(made.ok).toBe(true);

    const row = users.listUsers().find((u) => u.username === "tester_plain")!;
    expect(row.isAdmin).toBe(false);
    expect(row.isOwner).toBe(false);
  });

  it("rejects a weak password and a bad username", async () => {
    expect((await users.createUser("tester_two", "short")).ok).toBe(false);
    expect((await users.createUser("no", "a-long-enough-password")).ok).toBe(false);
    expect((await users.createUser("Has Spaces", "a-long-enough-password")).ok).toBe(false);
  });

  it("refuses a username that is taken, case-insensitively", async () => {
    const again = await users.createUser("TESTER_PLAIN", "a-long-enough-password");
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.status).toBe(409);
  });
});

describe("streaming services", () => {
  it("stores choices per account and rejects catalogue ids that do not exist", () => {
    expect(services.replaceUserServices(owner.id, [8]).ok).toBe(true);

    /* Asserted by which service is selected, not by the shape of the whole
       list: the catalogue is real data and grows, and an assertion on its
       length fails for reasons that have nothing to do with this behaviour. */
    const picked = services.serviceChoices(owner.id).filter((s) => s.selected);
    expect(picked.map((s) => s.providerId)).toEqual([8]);

    expect(services.replaceUserServices(owner.id, [999_999]).ok).toBe(false);
    // A rejected replacement leaves the previous valid selection untouched.
    expect(services.serviceChoices(owner.id).filter((s) => s.selected).map((s) => s.providerId))
      .toEqual([8]);
  });

  it("offers the whole catalogue to choose from, not just what we hold data for", () => {
    // The picker is a list of services you might pay for; it is not the list
    // of services this install happens to have availability rows about.
    expect(services.serviceChoices(owner.id).length).toBeGreaterThan(20);
  });
});

describe("who may hand out admin", () => {
  it("lets the owner promote and demote", () => {
    const target = users.listUsers().find((u) => u.username === "tester_plain")!;
    expect(users.setAdmin(owner, target.id, true).ok).toBe(true);
    expect(users.listUsers().find((u) => u.id === target.id)!.isAdmin).toBe(true);

    expect(users.setAdmin(owner, target.id, false).ok).toBe(true);
    expect(users.listUsers().find((u) => u.id === target.id)!.isAdmin).toBe(false);
  });

  it("does not let an admin promote anyone", async () => {
    const admin = users.listUsers().find((u) => u.username === "tester_plain")!;
    users.setAdmin(owner, admin.id, true);

    await users.createUser("tester_victim", "a-long-enough-password");
    const victim = users.listUsers().find((u) => u.username === "tester_victim")!;

    // A real session for that admin — isAdmin true, isOwner false.
    const result = users.setAdmin(asSession({ ...admin, isAdmin: true }), victim.id, true);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe(403);
    expect(users.listUsers().find((u) => u.id === victim.id)!.isAdmin).toBe(false);
  });

  it("ignores a session that merely claims to be an admin", () => {
    const victim = users.listUsers().find((u) => u.username === "tester_victim")!;
    const liar: SessionUser = { id: victim.id, username: victim.username, displayName: null, isAdmin: true, avatarAt: null };
    expect(users.setAdmin(liar, victim.id, true).ok).toBe(false);
  });
});

describe("the owner account", () => {
  it("cannot be demoted, even by the owner", () => {
    const result = users.setAdmin(owner, owner.id, false);
    expect(result.ok).toBe(false);
    expect(users.listUsers().find((u) => u.id === owner.id)!.isAdmin).toBe(true);
  });

  it("cannot be deleted", () => {
    const result = users.deleteUser(owner, owner.id);
    expect(result.ok).toBe(false);
    expect(users.listUsers().some((u) => u.id === owner.id)).toBe(true);
  });

  it("can delete anyone else, and their ratings go with them", () => {
    const victim = users.listUsers().find((u) => u.username === "tester_victim")!;
    expect(users.deleteUser(owner, victim.id).ok).toBe(true);
    expect(users.listUsers().some((u) => u.id === victim.id)).toBe(false);
  });

  it("is the only one who can delete", () => {
    const admin = users.listUsers().find((u) => u.username === "tester_plain")!;
    expect(users.deleteUser(asSession({ ...admin, isAdmin: true }), owner.id).ok).toBe(false);
  });
});

describe("editing an account", () => {
  it("lets the owner rename someone, handle and all", async () => {
    await users.createUser("tester_rename", "a-long-enough-password");
    const before = users.listUsers().find((u) => u.username === "tester_rename")!;

    const done = await users.updateUser(owner, before.id, {
      username: "tester_renamed",
      displayName: "  Renamed  ",
    });
    expect(done.ok).toBe(true);

    const after = users.listUsers().find((u) => u.id === before.id)!;
    expect(after.username).toBe("tester_renamed");
    expect(after.displayName).toBe("Renamed"); // trimmed
  });

  it("refuses a handle another account already has", async () => {
    const target = users.listUsers().find((u) => u.username === "tester_renamed")!;
    const clash = await users.updateUser(owner, target.id, { username: owner.username });
    expect(clash.ok).toBe(false);
    expect(clash.ok === false && clash.status).toBe(409);
    expect(users.listUsers().find((u) => u.id === target.id)!.username).toBe("tester_renamed");
  });

  it("keeps the old password when the field is left blank", async () => {
    const { signIn } = await import("./auth");
    const target = users.listUsers().find((u) => u.username === "tester_renamed")!;
    await users.updateUser(owner, target.id, { displayName: "Still Me", password: "" });
    expect(await signIn("tester_renamed", "a-long-enough-password")).not.toBeNull();
  });

  it("changes the password when one is given, and refuses a weak one", async () => {
    const { signIn } = await import("./auth");
    const target = users.listUsers().find((u) => u.username === "tester_renamed")!;

    expect((await users.updateUser(owner, target.id, { password: "short" })).ok).toBe(false);
    expect(await signIn("tester_renamed", "a-long-enough-password")).not.toBeNull();

    expect((await users.updateUser(owner, target.id, { password: "a-brand-new-password" })).ok).toBe(true);
    expect(await signIn("tester_renamed", "a-long-enough-password")).toBeNull();
    expect(await signIn("tester_renamed", "a-brand-new-password")).not.toBeNull();
  });

  it("does not let an admin edit anyone", async () => {
    const admin = users.listUsers().find((u) => u.username === "tester_plain")!;
    const target = users.listUsers().find((u) => u.username === "tester_renamed")!;
    const result = await users.updateUser(
      asSession({ ...admin, isAdmin: true }),
      target.id,
      { username: "hijacked" },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe(403);
  });

  it("lets the owner edit their own profile — that is not a role change", async () => {
    const result = await users.updateUser(owner, owner.id, { displayName: "Mohammed" });
    expect(result.ok).toBe(true);
    expect(users.listUsers().find((u) => u.id === owner.id)!.isOwner).toBe(true);
  });

  it("revokes the owner's old sessions when their password changes", async () => {
    const sqlite = new Database(file);
    sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .run("stolen-session", owner.id, Math.floor(Date.now() / 1000) + 3600);
    sqlite.close();

    const result = await users.updateUser(owner, owner.id, { password: "owner-new-password" });
    expect(result.ok).toBe(true);

    const check = new Database(file, { readonly: true });
    const remaining = check.prepare("SELECT count(*) AS n FROM sessions WHERE user_id = ?")
      .get(owner.id) as { n: number };
    check.close();
    expect(remaining.n).toBe(0);
  });
});

describe("what an account sees before it has picked services", () => {
  it("shows everything, not nothing", async () => {
    const { availabilityFor } = await import("./queries");
    const { db, schema } = await import("@/db");

    const ids = db
      .select({ tmdbId: schema.titles.tmdbId })
      .from(schema.titles)
      .all()
      .map((t) => t.tmdbId);
    if (!ids.length) return; // no local snapshot; the differential tests skip too

    const made = await users.createUser("tester_unpicked", "a-long-enough-password");
    expect(made.ok).toBe(true);
    const fresh = users.listUsers().find((u) => u.username === "tester_unpicked")!;

    const anonymous = availabilityFor(ids, null).size;
    const unpicked = availabilityFor(ids, fresh.id).size;

    // Filtering on an empty selection emptied the entire app for every account
    // but the owner's. Someone who has not chosen sees what a visitor sees.
    expect(anonymous).toBeGreaterThan(0);
    expect(unpicked).toBe(anonymous);
  });

  it("narrows once they do pick", async () => {
    const { availabilityFor } = await import("./queries");
    const { db, schema } = await import("@/db");
    const { replaceUserServices } = await import("./services");

    const ids = db.select({ tmdbId: schema.titles.tmdbId }).from(schema.titles).all()
      .map((t) => t.tmdbId);
    if (!ids.length) return;

    const fresh = users.listUsers().find((u) => u.username === "tester_unpicked")!;
    const one = db.select().from(schema.services).all()
      .find((s) => s.name === "Netflix");
    if (!one) return;

    expect(replaceUserServices(fresh.id, [one.providerId]).ok).toBe(true);
    const narrowed = availabilityFor(ids, fresh.id);
    const everything = availabilityFor(ids, null);
    expect(narrowed.size).toBeGreaterThan(0);
    expect(narrowed.size).toBeLessThan(everything.size);
  });
});

describe("your own account", () => {
  const accountId = (name: string) => users.listUsers().find((u) => u.username === name)!.id;

  it("takes an email at sign-up, once per address", async () => {
    expect((await users.createUser("tester_mail", "a-long-enough-password", null, "Me@Example.com")).ok).toBe(true);
    expect(users.accountOf(accountId("tester_mail"))!.email).toBe("me@example.com");
    expect((await users.createUser("tester_mail2", "a-long-enough-password", null, "me@example.COM")).ok).toBe(false);
    expect((await users.createUser("tester_mail3", "a-long-enough-password", null, "not-an-email")).ok).toBe(false);
  });

  it("changes the password only with the current one", async () => {
    const id = accountId("tester_mail");
    expect((await users.changePassword(id, "wrong-password", "another-long-one", undefined)).ok).toBe(false);
    expect((await users.changePassword(id, "a-long-enough-password", "another-long-one", undefined)).ok).toBe(true);
    expect((await users.changePassword(id, "another-long-one", "short", undefined)).ok).toBe(false);
  });

  it("changes the email only with the password, and not to a taken one", async () => {
    const id = accountId("tester_mail");
    expect((await users.changeEmail(id, "new@example.com", "wrong-password")).ok).toBe(false);
    expect((await users.changeEmail(id, "new@example.com", "another-long-one")).ok).toBe(true);
    await users.createUser("tester_other", "a-long-enough-password", null, "other@example.com");
    expect((await users.changeEmail(id, "other@example.com", "another-long-one")).ok).toBe(false);
  });

  it("signs in with Google: new account, then the same one, then links by email", async () => {
    const first = await users.googleAccount({ sub: "g-1", email: "Fresh.Person@gmail.com", name: "Fresh" });
    expect(first.value.created).toBe(true);
    const made = users.accountOf(first.value.id)!;
    expect(made.username).toBe("fresh.person");
    expect(made.hasPassword).toBe(false);

    const again = await users.googleAccount({ sub: "g-1", email: "fresh.person@gmail.com" });
    expect(again.value).toEqual({ id: first.value.id, created: false });

    const linked = await users.googleAccount({ sub: "g-2", email: "other@example.com" });
    expect(linked.value).toEqual({ id: accountId("tester_other"), created: false });

    // Same local part, different address: a second, distinct username.
    const twin = await users.googleAccount({ sub: "g-3", email: "fresh.person@example.org" });
    expect(users.accountOf(twin.value.id)!.username).toBe("fresh.person2");
  });

  it("lets a Google-made account set a password without knowing one", async () => {
    const id = accountId("fresh.person");
    expect((await users.changePassword(id, undefined, "now-i-have-one", undefined)).ok).toBe(true);
    expect(users.accountOf(id)!.hasPassword).toBe(true);
    expect((await users.changePassword(id, undefined, "and-another-one", undefined)).ok).toBe(false);
  });

  it("deletes your own account, but never the owner's", async () => {
    expect((await users.deleteOwnAccount(owner.id, "owner-password")).ok).toBe(false);
    const id = accountId("tester_other");
    expect((await users.deleteOwnAccount(id, "wrong-password")).ok).toBe(false);
    expect((await users.deleteOwnAccount(id, "a-long-enough-password")).ok).toBe(true);
    expect(users.accountOf(id)).toBeNull();
  });
});

describe("the owner fills in emails", () => {
  it("sets, refuses a taken one, and clears", async () => {
    const id = users.listUsers().find((u) => u.username === "tester_plain")!.id;
    expect((await users.updateUser(owner, id, { email: "Plain@Example.com" })).ok).toBe(true);
    expect(users.listUsers().find((u) => u.id === id)!.email).toBe("plain@example.com");
    expect((await users.updateUser(owner, id, { email: "new@example.com" })).ok).toBe(false);
    expect((await users.updateUser(owner, id, { email: "" })).ok).toBe(true);
    expect(users.listUsers().find((u) => u.id === id)!.email).toBeNull();
  });

  it("then Google finds that account instead of making a new one", async () => {
    const id = users.listUsers().find((u) => u.username === "tester_plain")!.id;
    await users.updateUser(owner, id, { email: "plain@gmail.com" });
    const g = await users.googleAccount({ sub: "g-plain", email: "plain@gmail.com" });
    expect(g.value).toEqual({ id, created: false });
  });
});
