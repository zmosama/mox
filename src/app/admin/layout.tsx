import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SignOut } from "@/components/SignOut";

export const dynamic = "force-dynamic";

/**
 * Everything under /admin needs a session. The login page lives here too, so it
 * opts out — otherwise signing in would require being signed in.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <h1 className="text-lg font-bold tracking-tight">Backend</h1>
        <nav className="flex flex-wrap gap-1">
          <AdminLink href="/admin">Overview</AdminLink>
          <AdminLink href="/admin/rate">Rate</AdminLink>
          <AdminLink href="/admin/services">Services</AdminLink>
          {/* Managing people is an admin job; rating is not, so a plain
              account still reaches the rest of the backend. */}
          {user.isAdmin ? <AdminLink href="/admin/users">Users</AdminLink> : null}
        </nav>
        <div className="ms-auto flex items-center gap-3 text-[12.5px] text-ink-faint">
          <span>{user.username}</span>
          <SignOut />
        </div>
      </div>
      {children}
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="min-h-11 content-center rounded-full px-3.5 text-[13px] font-medium text-ink-dim transition hover:bg-surface hover:text-ink sm:min-h-0 sm:py-1.5"
    >
      {children}
    </Link>
  );
}
