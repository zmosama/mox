import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/admin");

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <h1 className="text-2xl font-bold tracking-tight">
        Sign in to m<span className="text-love">o</span>x
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-faint">
        The site works signed out. Signing in loads your ratings and lets you add more.
      </p>
      <LoginForm />
    </div>
  );
}
