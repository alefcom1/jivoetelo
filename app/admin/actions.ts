"use server";

/**
 * Серверные действия админки.
 *
 * В каждом действии первым шагом стоит `requireAdmin()`. Это не дублирование
 * проверки в `app/admin/layout.tsx`: макет защищает только рендер страницы,
 * а server actions вызываются отдельным запросом, который макет не видит.
 * Без собственной проверки в каждом действии кто угодно, узнавший имя
 * action-функции (оно есть в собранном клиентском бандле), мог бы вызвать
 * её напрямую, минуя страницу и её 404.
 */

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createSpecialistByEmail, setSpecialistStatus } from "@/lib/pro/store";
import type { SpecialistStatus } from "@/lib/pro/access";

const SETTABLE_STATUSES = new Set<SpecialistStatus>(["pending", "approved", "rejected", "suspended"]);

/**
 * Заводит профиль специалиста из заявки. Форма приходит со страницы
 * `/admin`, где для каждой заявки — свой набор полей и своя кнопка.
 */
export async function confirmSpecialistAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const applicationId = String(formData.get("applicationId") ?? "");
  // Почта приходит скрытым полем из заявки, а не вводится руками — но форму
  // всё равно нормализуем на входе, а не доверяем чужому HTML буквально.
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 100);
  const specialization = String(formData.get("specialization") ?? "").trim().slice(0, 100);
  const city = String(formData.get("city") ?? "").trim().slice(0, 100);

  // Порядок важен: сначала строка запроса, потом якорь — иначе браузер не
  // проскроллит к нужной заявке.
  const backTo = (params: string) => `/admin?${params}#application-${applicationId}`;

  if (!email || !displayName) {
    // Пустое имя браузер не должен был пропустить (поле обязательное), но
    // если это всё же случилось — не пишем в базу пустую строку.
    redirect(backTo(`admError=no_user&admEmail=${encodeURIComponent(email)}`));
  }

  const result = await createSpecialistByEmail({
    email,
    displayName,
    specialization: specialization || null,
    city: city || null,
    now: new Date(),
  });

  revalidatePath("/admin");

  if (!result.ok) {
    redirect(backTo(`admError=${result.reason}&admEmail=${encodeURIComponent(email)}`));
  }

  redirect(`/admin?admConfirmed=${encodeURIComponent(email)}#specialists`);
}

/**
 * Меняет статус специалиста. Кнопки на странице показывают только переходы,
 * осмысленные для текущего статуса, но само действие проверяет значение
 * ещё раз — форму на странице генерируем мы, но POST на этот адрес может
 * прийти и не из неё.
 */
export async function setSpecialistStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const userId = Number(formData.get("userId"));
  const status = String(formData.get("status") ?? "");

  if (!Number.isInteger(userId) || !SETTABLE_STATUSES.has(status as SpecialistStatus)) {
    return;
  }

  await setSpecialistStatus(userId, status, new Date());
  revalidatePath("/admin");
}
