import { redirect } from "next/navigation";
import { UserAdmin } from "@/components/UserAdmin";
import { currentUser } from "@/lib/auth";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  // The backend is open to any signed-in account so they can rate; this page
  // is not.
  if (!user.isAdmin) redirect("/admin");

  const users = listUsers();
  const isOwner = users.some((u) => u.id === user.id && u.isOwner);

  return (
    <div>
      <h2 className="text-[19px] font-bold tracking-tight">Users</h2>
      <p className="mb-5 mt-1 text-[13px] text-ink-dim">
        {users.length} account{users.length === 1 ? "" : "s"}. Anyone can register from the
        sign-in page; new accounts are plain users until the owner says otherwise.
      </p>
      <UserAdmin users={users} isOwner={isOwner} meId={user.id} />
    </div>
  );
}
