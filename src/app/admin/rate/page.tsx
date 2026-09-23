import { redirect } from "next/navigation";
import { RatingWall } from "@/components/RatingWall";
import { currentUser } from "@/lib/auth";
import { ratingWall } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RatePage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  return <RatingWall items={ratingWall(user.id)} />;
}
