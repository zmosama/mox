"use client";

import { useRouter } from "next/navigation";
import { forgetTitles } from "./titleCache";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        forgetTitles();
        router.replace("/");
        router.refresh();
      }}
      className="rounded-full border border-line-strong px-3 py-1 font-medium transition hover:border-ink-faint hover:text-ink"
    >
      Sign out
    </button>
  );
}
