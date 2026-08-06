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
import { reviewPhoto } from "@/lib/catalog-photos-store";
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

/**
 * Решение по снимку каталога. Так же, как и выше: `requireAdmin()` первым
 * шагом, потому что server action вызывается запросом, которого макет не
 * видит.
 *
 * Отказ требует причины и не даёт её пропустить: снимок отклоняют, когда в
 * кадр попало лишнее, и человеку надо будет что-то ответить.
 */
export async function reviewCatalogPhotoAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") ?? "");
  if (!Number.isInteger(id) || id <= 0) notFound();
  if (decision !== "approved" && decision !== "rejected") notFound();

  const comment = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const moderatorNote = String(formData.get("moderatorNote") ?? "").trim().slice(0, 500) || null;
  await reviewPhoto(id, decision, decision === "rejected" ? comment || "Без указания причины" : undefined, moderatorNote);

  /**
   * Ответ автору. Раньше причина отказа только сохранялась, и человек не
   * узнавал о снимке ничего — ни что тот опубликован, ни что отклонён и
   * почему. Отправка не должна ронять модерацию: не дошедшее видно по
   * пустому `notified_at`.
   */
  const { notifyDecision } = await import("@/lib/catalog-photos-store");
  await notifyDecision(id, comment || null).catch((error) => {
    console.error("не удалось написать автору снимка", error);
  });

  revalidatePath("/admin/photos");
}

/**
 * Выдать доступ руками — компенсация за сбой, доступ для своих, тестирование.
 *
 * Идёт мимо ваучера сознательно: код имеет смысл, когда его кому-то отдают,
 * а здесь администратор уже знает, кому именно, и лишний шаг «выпусти код,
 * потом погаси его за человека» только добавил бы способ ошибиться.
 */
export async function grantAccessAction(
  personId: number,
  days: number,
): Promise<{ ok: true; accessUntil: string } | { ok: false; message: string }> {
  const admin = await requireAdmin();
  if (!admin) notFound();

  // Пределы, а не доверие числу с клиента: server action вызывается отдельным
  // запросом, и `days` туда кладёт кто угодно, узнавший имя функции.
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return { ok: false, message: "Срок должен быть от 1 до 3650 дней." };
  }
  if (!Number.isInteger(personId) || personId <= 0) return { ok: false, message: "Неизвестный человек." };

  const { grantAccessDays } = await import("@/lib/vouchers-store");
  const { logAdminAccess } = await import("@/lib/admin-people");
  const accessUntil = await grantAccessDays(personId, days);
  await logAdminAccess(admin.id, personId, "grant");

  revalidatePath("/admin/users");
  return { ok: true, accessUntil: accessUntil.toISOString() };
}

/** Выдать ваучеры — поштучно или пачкой для раздачи. */
export async function issueVouchersAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const days = Number(formData.get("days"));
  const count = Number(formData.get("count") ?? 1);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();

  if (!Number.isInteger(days) || days < 1 || days > 3650) notFound();
  // Сотня за раз — не техническое ограничение, а защита от опечатки в поле
  // «сколько»: тысяча кодов, выпущенных случайно, это тысяча живых ключей.
  if (!Number.isInteger(count) || count < 1 || count > 100) notFound();

  const { issueBatch } = await import("@/lib/vouchers-store");
  await issueBatch(count, {
    days,
    issuedBy: admin.id,
    note,
    expiresAt: expiresRaw ? new Date(`${expiresRaw}T23:59:59`) : null,
  });

  revalidatePath("/admin/vouchers");
}

/**
 * Закрыть платный доступ — обратное действие к выдаче.
 *
 * Нужно ровно там же, где выдача: доступ открывают по ошибке, выдают на
 * время теста, компенсируют сбой не тому человеку. Без обратной кнопки
 * единственным способом снять его была правка базы руками — то есть способ,
 * которым в спешке ошибаются и который не оставляет следа.
 *
 * След тут особенно нужен: снятие доступа человек заметит, и на вопрос
 * «кто и когда» надо отвечать записью. Пишем в журнал независимо от того,
 * был ли доступ открыт: попытка снять — тоже обращение к чужим данным.
 */
export async function revokeAccessAction(
  personId: number,
): Promise<{ ok: true; had: boolean } | { ok: false; message: string }> {
  const admin = await requireAdmin();
  if (!admin) notFound();

  if (!Number.isInteger(personId) || personId <= 0) return { ok: false, message: "Неизвестный человек." };

  const { revokeAccess } = await import("@/lib/vouchers-store");
  const { logAdminAccess } = await import("@/lib/admin-people");
  const had = await revokeAccess(personId);
  await logAdminAccess(admin.id, personId, "revoke");

  revalidatePath("/admin/users");
  return { ok: true, had };
}
