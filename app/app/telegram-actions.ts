"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createLinkCode } from "@/lib/telegram";

export type LinkCodeState = { code: string | null; expiresAt: string | null; error: string | null };

/** Генерирует одноразовый код для привязки Telegram в Mini App. */
export async function generateLinkCode(): Promise<LinkCodeState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    const { code, expiresAt } = await createLinkCode(user.id);
    return { code, expiresAt: expiresAt.toISOString(), error: null };
  } catch (error) {
    console.error("generateLinkCode failed", error);
    return { code: null, expiresAt: null, error: "Не получилось создать код. Попробуйте ещё раз." };
  }
}

export async function unlinkTelegram(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await getDb().update(users).set({ telegramUserId: null }).where(eq(users.id, user.id));
  revalidatePath("/app/settings");
}
