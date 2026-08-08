"use server";

/**
 * Серверные действия экрана «Живое Тело Pro» на стороне клиента.
 *
 * Общее для всех четырёх действий правило: `getCurrentUser()` вызывается
 * первым, до чтения любого поля формы. Формы этого экрана управляют доступом
 * к дневнику питания, и «сначала посмотреть, что прислали, потом решить,
 * авторизован ли отправитель» — обратный порядок для такого экрана.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { checkInvite, normalizeInviteCode } from "@/lib/pro/invite";
import { normalizeScopes } from "@/lib/pro/access";
import { acceptInvite, findInvite, specialistCardFor, revokeLink, updateScopes } from "@/lib/pro/store";

const SPECIALISTS_PATH = "/app/specialists";

export type CheckCodeState = {
  status: "idle" | "invalid" | "not_found" | "expired" | "used" | "self" | "found";
  /** Нормализованный код — переносится на второй шаг формы как есть. */
  code?: string;
  specialistName?: string;
  /** Проверял ли профиль человек. С самостоятельной регистрацией — не всегда. */
  specialistVerified?: boolean;
};

/**
 * Шаг 1 экрана согласия: проверяет код и, если он годится, возвращает имя
 * специалиста — чтобы человек увидел, кому именно собирается открыть доступ,
 * прежде чем увидит хоть один чекбокс объёма.
 */
export async function checkCode(_prev: CheckCodeState, formData: FormData): Promise<CheckCodeState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const raw = String(formData.get("code") ?? "");
  const normalized = normalizeInviteCode(raw);
  if (!normalized) return { status: "invalid" };

  const invite = await findInvite(normalized);
  const result = checkInvite(invite, user.id, new Date());
  if (!result.valid) return { status: result.reason };
  // `checkInvite` возвращает `valid: true` только когда `invite` не `null` —
  // но это инвариант её реализации, а не типа, поэтому проверяем явно, а не
  // приводим типы принудительно.
  if (!invite) return { status: "not_found" };

  const card = await specialistCardFor(invite.specialistUserId);
  // Специалист мог потерять доступ к разделу уже после выпуска кода
  // (см. `specialistCardFor`, она смотрит только на approved). Отдаём тот же
  // отказ, что и для несуществующего кода: разница не помогает клиенту, а
  // закрытому специалисту клиентов иметь не полагается.
  if (!card) return { status: "not_found" };

  // Отметка о проверке едет вместе с именем, а не запрашивается отдельно.
  // Имя без неё — утверждение, которого мы не делали: человек, увидевший
  // «Марина Соколова, нутрициолог», по умолчанию решит, что сервис её знает.
  // С тех пор как регистрация стала самостоятельной, это неправда.
  return { status: "found", code: normalized, specialistName: card.displayName, specialistVerified: card.verified };
}

export type GrantAccessState = {
  status: "idle" | "invalid" | "not_found" | "expired" | "used" | "self" | "empty_scope" | "error" | "success";
};

/**
 * Шаг 2: заводит связь. Код перепроверяется с нуля — то, что пришло со
 * второго шага формы, это данные, присланные браузером, а не факт, уже
 * установленный на шаге 1. За время, пока человек читал экран согласия и
 * отмечал галочки, код мог истечь или его мог использовать кто-то другой
 * (например, тот же человек в соседней вкладке).
 */
export async function grantAccess(_prev: GrantAccessState, formData: FormData): Promise<GrantAccessState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const raw = String(formData.get("code") ?? "");
  const normalized = normalizeInviteCode(raw);
  if (!normalized) return { status: "invalid" };

  const invite = await findInvite(normalized);
  const now = new Date();
  const result = checkInvite(invite, user.id, now);
  if (!result.valid) return { status: result.reason };
  if (!invite) return { status: "not_found" };

  const scopes = normalizeScopes(formData.getAll("scope"));
  // Пустой объём — не ошибка ввода формы, а осмысленный отказ «ничего не
  // показывать», и заводить связь ради него незачем: это и есть отсутствие
  // согласия. Отдаём отдельный статус, чтобы форма могла объяснить, что
  // не так, а не просто отказать молча.
  if (scopes.length === 0) return { status: "empty_scope" };

  const clientName = String(formData.get("clientName") ?? "").trim();

  try {
    await acceptInvite({
      code: normalized,
      clientUserId: user.id,
      specialistUserId: invite.specialistUserId,
      scopes,
      clientName: clientName || null,
      now,
    });
  } catch (error) {
    console.error("acceptInvite failed", error);
    return { status: "error" };
  }

  revalidatePath(SPECIALISTS_PATH);
  return { status: "success" };
}

/**
 * Меняет объём доступа у уже существующей связи.
 *
 * `linkId` приходит из формы, то есть от пользователя, а не из проверенного
 * источника, поэтому его нельзя использовать сам по себе. `updateScopes`
 * принимает `user.id` вторым аргументом и включает его в `WHERE` того же
 * SQL-запроса (см. `lib/pro/store.ts`) — значит, чужой `linkId`, даже
 * подставленный вручную, не совпадёт ни с одной строкой этого пользователя
 * и не изменит чужую связь. Это не «на всякий случай ещё одна проверка»,
 * а единственное место, где вообще решается, чья это связь.
 */
export async function changeScopes(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const linkId = Number(formData.get("linkId"));
  if (!Number.isInteger(linkId)) return;

  const scopes = normalizeScopes(formData.getAll("scope"));
  const now = new Date();

  // Пустой набор здесь равнозначен отзыву: связь без единого разрешённого
  // раздела ничем не отличается от отсутствия связи, а строка «доступ есть,
  // но ничего не открыто» в списке только запутала бы человека.
  if (scopes.length === 0) {
    await revokeLink(linkId, user.id, now);
  } else {
    await updateScopes(linkId, user.id, scopes, now);
  }

  revalidatePath(SPECIALISTS_PATH);
}

/**
 * Отзывает доступ. `linkId` + `user.id` в `WHERE` — та же защита, что описана
 * в комментарии к `changeScopes`: связь может закрыть только тот, кому она
 * принадлежит, и это гарантирует запрос в базе, а не проверка здесь.
 */
export async function revoke(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const linkId = Number(formData.get("linkId"));
  if (!Number.isInteger(linkId)) return;

  await revokeLink(linkId, user.id, new Date());
  revalidatePath(SPECIALISTS_PATH);
}
