// Отписка от отчётов по токену — то, чем пользуется почтовый клиент, а не
// человек.
//
// Человеку хватает ссылки на настройки: он и так вошёл, и там же можно не
// отписаться совсем, а оставить только месячный отчёт. Gmail и Яндекс.Почта
// рисуют собственную кнопку «Отписаться» по заголовку List-Unsubscribe и
// дёргают её сами, без сессии (RFC 8058), — вот для них и токен.
//
// Обработчик только POST. GET здесь был бы опасен: почтовые сканеры и
// антивирусы предзагружают ссылки из писем, и отписка случалась бы у людей,
// которые ни на что не нажимали.

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reportPreferences } from "@/db/schema";
import { absoluteUrl } from "./site.ts";

export function newReportToken(): string {
  return randomBytes(24).toString("base64url");
}

export function reportUnsubscribePostUrl(token: string): string {
  return absoluteUrl(`/api/reports/unsubscribe?token=${encodeURIComponent(token)}`);
}

/**
 * Токен отписки этого пользователя, создавая строку настроек, если её ещё нет.
 *
 * Строки может не быть: настройки по умолчанию не записываются никому, пока
 * человек их не тронул. Первое письмо и заводит строку — со значениями по
 * умолчанию, так что поведение от этого не меняется.
 */
export async function ensureReportToken(userId: number): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ token: reportPreferences.unsubscribeToken })
    .from(reportPreferences)
    .where(eq(reportPreferences.userId, userId))
    .limit(1);
  if (existing[0]?.token) return existing[0].token;

  const token = newReportToken();
  await db
    .insert(reportPreferences)
    .values({ userId, unsubscribeToken: token })
    .onConflictDoUpdate({
      target: reportPreferences.userId,
      // Только токен: настройки каналов при этом трогать нельзя, строка могла
      // существовать и без токена.
      set: { unsubscribeToken: token },
    });
  return token;
}

/**
 * Выключает обе рассылки. Возвращает false, если токен неизвестен, — но
 * обработчик этим не пользуется и отвечает одинаково в любом случае:
 * расписываться о том, знаком ли нам токен, здесь не перед кем.
 */
export async function unsubscribeReportsByToken(token: string): Promise<boolean> {
  if (!token) return false;
  const updated = await getDb()
    .update(reportPreferences)
    .set({ weekly: "off", monthly: "off", updatedAt: new Date() })
    .where(eq(reportPreferences.unsubscribeToken, token))
    .returning({ userId: reportPreferences.userId });
  return updated.length > 0;
}
