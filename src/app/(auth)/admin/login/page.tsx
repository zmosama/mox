import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentUser } from "@/lib/auth";
import { googleClientIds } from "@/lib/google";

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
      {/* The first ID is the web client's; the iOS one is only ever checked. */}
      <LoginForm googleClientId={googleClientIds()[0] ?? null} />
      <p className="mt-6 text-center text-[12px] text-ink-faint">
        <a href="/privacy" className="hover:text-ink">Privacy</a> · <a href="/terms" className="hover:text-ink">Terms</a>
      </p>
    </div>
  );
}
