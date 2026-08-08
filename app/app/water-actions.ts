"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isValidDay, localToday } from "@/lib/dates";
import { MAX_ENTRY_ML, MIN_ENTRY_ML } from "@/lib/water-log";
import { addWater, undoLastWater } from "@/lib/water-store";

/**
 * Записать выпитое и отменить последнюю запись.
 *
 * Обе формы отправляют день, который человек сейчас смотрит: на «Сегодня»
 * можно листать назад, и стакан, добавленный на странице вчерашнего дня,
 * обязан попасть во вчера. Тот же разбор дня, что и в остальном кабинете, —
 * `isValidDay`, иначе сегодняшняя дата.
 */
export async function logWater(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rawDay = formData.get("day");
  const day = isValidDay(typeof rawDay === "string" ? rawDay : undefined) ? String(rawDay) : localToday();

  const ml = Number(formData.get("ml"));
  // Молча ничего не делаем при мусоре на входе: единственный способ прислать
  // его — обойти форму руками, и отдельного экрана ошибки это не заслуживает.
  if (Number.isFinite(ml) && ml >= MIN_ENTRY_ML && ml <= MAX_ENTRY_ML) {
    await addWater(user.id, day, ml);
  }

  revalidatePath("/app");
}

export async function undoWater(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rawDay = formData.get("day");
  const day = isValidDay(typeof rawDay === "string" ? rawDay : undefined) ? String(rawDay) : localToday();

  await undoLastWater(user.id, day);
  revalidatePath("/app");
}
