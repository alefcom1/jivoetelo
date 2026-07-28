"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { upsertPreferences } from "@/lib/bot/store";
import { getCurrentUser } from "@/lib/auth";
import { normalizeDigestHour } from "@/lib/reminders";

/**
 * Настройки напоминаний. Сохраняются одной формой: включённость и час — это
 * одно решение человека, и разводить их по двум кнопкам значило бы заставлять
 * нажимать дважды.
 */
export async function saveBotPreferences(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await upsertPreferences(user.id, {
    remindersEnabled: formData.get("remindersEnabled") === "on",
    digestHour: normalizeDigestHour(formData.get("digestHour")),
    // Явная настройка отменяет паузу: человек только что сказал, чего хочет.
    snoozedUntil: null,
  });
  revalidatePath("/app/settings");
}
