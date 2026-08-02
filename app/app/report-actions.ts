"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { reportPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_REPORT_PREFERENCES, isChannelSetting } from "@/lib/report-prefs";

/**
 * Настройки отчётов. Одной формой: канал недели, канал месяца и килограммы —
 * это одно решение про одну рассылку, и разносить их по трём кнопкам значило
 * бы заставлять нажимать трижды.
 */
export async function saveReportPreferences(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const weekly = formData.get("weekly");
  const monthly = formData.get("monthly");
  const values = {
    // Непонятное значение — это не повод падать и не повод угадывать: берём
    // умолчание. Форма выпадающая, и попасть сюда с мусором можно только
    // мимо неё.
    weekly: isChannelSetting(weekly) ? weekly : DEFAULT_REPORT_PREFERENCES.weekly,
    monthly: isChannelSetting(monthly) ? monthly : DEFAULT_REPORT_PREFERENCES.monthly,
    weightNumbers: formData.get("weightNumbers") === "on",
  };

  await getDb()
    .insert(reportPreferences)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({
      target: reportPreferences.userId,
      set: { ...values, updatedAt: new Date() },
    });

  revalidatePath("/app/settings");
}
