import { LoginForm } from "@/components/LoginForm";
import { TvApprove } from "@/components/TvApprove";
import { currentUser } from "@/lib/auth";
import { googleClientIds } from "@/lib/google";
import { normalizeCode, tvLoginWaiting } from "@/lib/tv-login";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in on Apple TV" };

/**
 * Where the QR on an Apple TV leads: approve the TV showing this code, from a
 * phone that is already signed in. See src/lib/tv-login.ts.
 */
export default async function TvPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = normalizeCode((await searchParams).code);
  const user = await currentUser();

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <h1 className="text-2xl font-bold tracking-tight">
        m<span className="text-love">o</span>x on Apple TV
      </h1>
      {!user ? (
        <>
          <p className="mt-1.5 text-[13.5px] text-ink-faint">
            Sign in here first — with Google or your password — and the next step is one button.
          </p>
          {/* Signed in, it comes straight back here with the TV's code still in hand. */}
          <LoginForm
            googleClientId={googleClientIds()[0] ?? null}
            next={code ? `/tv?code=${code}` : "/tv"}
          />
        </>
      ) : (
        <TvApprove
          name={user.displayName ?? user.username}
          code={code}
          waiting={code ? tvLoginWaiting(code) : false}
        />
      )}
    </div>
  );
}
