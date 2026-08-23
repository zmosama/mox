import { redirect } from "next/navigation";
import { RatingWall } from "@/components/RatingWall";
import { currentUser } from "@/lib/auth";
import { ratingWall } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RatePage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  return (
    <>
      <p className="mb-4 text-[13px] text-ink-faint">
        Ordered so the titles you are most likely to have seen come first. Hover a poster for the
        buttons; pressing the same one again clears it. Untouched means you haven’t seen it.
      </p>
      <RatingWall items={ratingWall(user.id)} />
    </>
  );
}
