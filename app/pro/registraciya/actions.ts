"use server";

/**
 * Регистрация специалиста — своими руками, без очереди.
 *
 * До этого путь был один: анкета из семи полей → строка в `pro_applications`
 * → человек читает → руками заводит профиль. Между «хочу работать» и
 * «работаю» стояли сутки и наша очередь.
 *
 * Открыть это без предварительной проверки можно потому, что **кабинет сам
 * по себе не открывает ни одного байта чужих данных**. Он позволяет выдать
 * код; код показывает клиенту экран согласия; что именно откроется — решает
 * клиент, по разделам и с отзывом в один клик. Дверь стоит у клиента и
 * охраняется `canAccess` (lib/pro/access.ts), а проверка сторожила прихожую.
 *
 * Что проверка давала на самом деле — уверенность клиента, что за именем
 * стоит практика. Это осталось, но стало отметкой рядом с именем, а не
 * воротами перед кабинетом.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getSpecialistProfile } from "@/lib/pro/guard";
import { registerSpecialist, updateSpecialistProfile } from "@/lib/pro/store";
import { validateSignup } from "@/lib/pro/signup";

export type SignupState = {
  status: "idle" | "invalid" | "blocked";
  message?: string;
  /** Введённое возвращается вместе с ошибкой: иначе форма очистится. */
  displayName?: string;
  specialization?: string;
  city?: string;
  about?: string;
};

export async function registerSpecialistAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const raw = {
    displayName: String(formData.get("displayName") ?? ""),
    specialization: String(formData.get("specialization") ?? ""),
    city: String(formData.get("city") ?? ""),
    about: String(formData.get("about") ?? ""),
  };

  const result = validateSignup({ ...raw, consent: formData.get("consent") === "on" });
  if (!result.ok) return { status: "invalid", message: result.message, ...raw };

  // Профиль мог появиться раньше — прежним, ручным путём. Тогда это правка, а
  // не заведение: перезаписывать статус нельзя, иначе заблокированный
  // специалист восстанавливал бы себе доступ, просто открыв форму.
  const existing = await getSpecialistProfile(user.id);
  if (existing) {
    if (existing.status === "rejected" || existing.status === "suspended") {
      return {
        status: "blocked",
        message: "Доступ к разделу закрыт. Если это ошибка, ответьте на наше письмо — мы разберёмся.",
      };
    }
    await updateSpecialistProfile({ userId: user.id, ...result.value });
  } else {
    await registerSpecialist({ userId: user.id, ...result.value });
  }

  revalidatePath("/pro/clients");
  redirect("/pro/clients");
}
