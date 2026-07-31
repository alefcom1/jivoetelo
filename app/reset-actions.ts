"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { passwordResets, sessions, users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { getMailer } from "@/lib/mailer";
import { hashPassword } from "@/lib/password";
import {
  checkNewPassword,
  checkResetToken,
  createResetToken,
  hashResetToken,
  MIN_PASSWORD_LENGTH,
  resetEmail,
} from "@/lib/password-reset";
import { absoluteUrl } from "@/lib/site";

export type RequestResetState = { status: "idle" | "sent" | "invalid" };

/**
 * Запрос ссылки на смену пароля.
 *
 * Ответ одинаковый и когда адрес найден, и когда нет. Разный ответ превратил
 * бы эту форму в проверку, зарегистрирован ли человек в дневнике питания, —
 * сведения, которые незачем сообщать любому, кто угадал адрес.
 *
 * По той же причине здесь нет и разницы во времени ответа, заметной глазом:
 * письмо отправляется тем же запросом, а не в фоне, поэтому «нашли» и «не
 * нашли» отличаются только временем работы SMTP.
 */
export async function requestReset(_prev: RequestResetState, formData: FormData): Promise<RequestResetState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { status: "invalid" };

  try {
    const db = getDb();
    const found = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    const userId = found[0]?.id;

    if (userId) {
      const now = new Date();
      const { token, tokenHash, expiresAt } = createResetToken(now);
      await db.insert(passwordResets).values({ tokenHash, userId, expiresAt });

      const link = absoluteUrl(`/reset?token=${encodeURIComponent(token)}`);
      const letter = resetEmail(link);
      await getMailer().send({ to: email, subject: letter.subject, text: letter.text, html: letter.html });
    }
  } catch (error) {
    // Об ошибке не сообщаем: иначе по её наличию тоже можно отличить
    // существующий адрес от несуществующего. В лог — полностью.
    console.error("password reset request failed", error);
  }

  return { status: "sent" };
}

export type ApplyResetState = {
  status: "idle" | "too_short" | "mismatch" | "not_found" | "expired" | "used" | "error";
};

/**
 * Установка нового пароля по ссылке.
 *
 * Токен проверяется заново, а не берётся на веру из формы: между открытием
 * страницы и отправкой он мог истечь или быть использованным в другой
 * вкладке, и второй шаг обязан отказать так же, как первый.
 *
 * После смены гасятся все сессии пользователя. Человек меняет пароль обычно
 * потому, что боится за доступ, — оставить чужой вход живым значит не решить
 * ровно ту задачу, ради которой он пришёл. Свою сессию заводим тут же, чтобы
 * он не вводил новый пароль сразу после того, как его придумал.
 */
export async function applyReset(_prev: ApplyResetState, formData: FormData): Promise<ApplyResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  const problem = checkNewPassword(password, repeat);
  if (problem) return { status: problem };

  let userId: number;
  try {
    const db = getDb();
    const tokenHash = hashResetToken(token);
    const rows = await db
      .select({ userId: passwordResets.userId, expiresAt: passwordResets.expiresAt, usedAt: passwordResets.usedAt })
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, tokenHash))
      .limit(1);

    const check = checkResetToken(rows[0] ?? null, new Date());
    if (!check.valid) return { status: check.reason };
    userId = check.userId;

    const now = new Date();
    // Гасим токен условием в самом запросе: между проверкой выше и этим
    // обновлением ссылку могли использовать во второй вкладке.
    const claimed = await db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt)))
      .returning({ tokenHash: passwordResets.tokenHash });
    if (claimed.length === 0) return { status: "used" };

    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    // Заодно гасим остальные невыданные ссылки этого человека: если запрос
    // делали несколько раз, старые письма после смены пароля работать не должны.
    await db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)));
  } catch (error) {
    console.error("password reset apply failed", error);
    return { status: "error" };
  }

  await createSession(userId);
  redirect("/app");
}

export { MIN_PASSWORD_LENGTH };
