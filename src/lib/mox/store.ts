/** MOX's own records: its soul and model, what it remembers, the conversation. Owner only, by callers. */
import { and, asc, desc, eq } from "drizzle-orm";
import type { CardTitle } from "@/components/TitleCard";
import { db, schema } from "@/db";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "../ai";
import { DEFAULT_SOUL } from "./identity";

export type MoxSettings = { soul: string; chatModel: string; customSoul: boolean };

export function moxSettings(userId: number): MoxSettings {
  const row = db.select().from(schema.moxSettings).where(eq(schema.moxSettings.userId, userId)).get();
  const model = CHAT_MODELS.some((m) => m.id === row?.chatModel) ? row!.chatModel! : DEFAULT_CHAT_MODEL;
  return { soul: row?.soul?.trim() || DEFAULT_SOUL, chatModel: model, customSoul: Boolean(row?.soul?.trim()) };
}

export function saveMoxSettings(userId: number, next: { soul?: string | null; chatModel?: string }) {
  const now = Math.floor(Date.now() / 1000);
  const set: Partial<typeof schema.moxSettings.$inferInsert> = { updatedAt: now };
  if (next.soul !== undefined) set.soul = next.soul?.trim() || null;
  if (next.chatModel !== undefined) set.chatModel = next.chatModel;
  db.insert(schema.moxSettings).values({ userId, ...set }).onConflictDoUpdate({ target: schema.moxSettings.userId, set }).run();
}

export type Memory = { id: number; text: string; source: "chat" | "told"; createdAt: number };

export function memoriesOf(userId: number): Memory[] {
  return db
    .select({ id: schema.moxMemories.id, text: schema.moxMemories.text, source: schema.moxMemories.source, createdAt: schema.moxMemories.createdAt })
    .from(schema.moxMemories)
    .where(eq(schema.moxMemories.userId, userId))
    .orderBy(asc(schema.moxMemories.id))
    .all();
}

export function addMemory(userId: number, text: string, source: Memory["source"]): number {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, 300);
  const same = memoriesOf(userId).find((m) => m.text.toLowerCase() === clean.toLowerCase());
  if (same) return same.id;
  return Number(db.insert(schema.moxMemories).values({ userId, text: clean, source }).run().lastInsertRowid);
}

export function deleteMemory(userId: number, id: number): boolean {
  return db.delete(schema.moxMemories).where(and(eq(schema.moxMemories.userId, userId), eq(schema.moxMemories.id, id))).run().changes > 0;
}

export type ChatLine = { id: number; role: "user" | "assistant"; text: string; titles: CardTitle[]; createdAt: number };

const titlesOf = (raw: string | null): CardTitle[] => {
  try {
    return raw ? (JSON.parse(raw) as CardTitle[]) : [];
  } catch {
    return [];
  }
};

/** The last `limit` lines of the conversation, oldest first. */
export function chatHistory(userId: number, limit = 40): ChatLine[] {
  return db
    .select()
    .from(schema.moxMessages)
    .where(eq(schema.moxMessages.userId, userId))
    .orderBy(desc(schema.moxMessages.id))
    .limit(limit)
    .all()
    .reverse()
    .map((r) => ({ id: r.id, role: r.role, text: r.content, titles: titlesOf(r.titles), createdAt: r.createdAt }));
}

export function addChatLine(userId: number, role: ChatLine["role"], text: string, titles: CardTitle[] = []) {
  db.insert(schema.moxMessages).values({ userId, role, content: text, titles: titles.length ? JSON.stringify(titles) : null }).run();
}

export function clearChat(userId: number) {
  db.delete(schema.moxMessages).where(eq(schema.moxMessages.userId, userId)).run();
}
