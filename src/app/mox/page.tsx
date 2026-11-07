import { notFound } from "next/navigation";
import { MoxChat } from "@/components/MoxChat";
import { aiAvailable, CHAT_MODELS } from "@/lib/ai";
import { currentOwner } from "@/lib/auth";
import { DEFAULT_SOUL } from "@/lib/mox/identity";
import { chatHistory, memoriesOf, moxSettings } from "@/lib/mox/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "MOX" };

/** MOX, the owner's assistant. Nobody else has this page: for them it does not exist. */
export default async function MoxPage() {
  const owner = await currentOwner();
  if (!owner) notFound();
  const settings = moxSettings(owner.id);
  return (
    <MoxChat
      name={owner.displayName ?? owner.username}
      connected={aiAvailable()}
      initialLines={chatHistory(owner.id, 60)}
      initialMemories={memoriesOf(owner.id)}
      soul={settings.customSoul ? settings.soul : ""}
      defaultSoul={DEFAULT_SOUL}
      chatModel={settings.chatModel}
      models={CHAT_MODELS.map((m) => ({ ...m }))}
    />
  );
}
