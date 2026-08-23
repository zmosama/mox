import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceChoices } from "@/lib/services";
import { ServiceSettings } from "@/components/ServiceSettings";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  const services = serviceChoices(user.id);

  return (
    <section>
      <h2 className="text-[19px] font-bold tracking-tight">Your services</h2>
      <p className="mb-5 mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        Pick the subscriptions you have. Board, New, Universes, search and title details will use
        this list for your account only.
      </p>
      <ServiceSettings services={services} />
    </section>
  );
}
