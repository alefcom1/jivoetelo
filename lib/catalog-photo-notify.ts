/**
 * Ответ автору снимка, отправленного в каталог.
 *
 * ## Зачем это понадобилось
 *
 * Причина отказа хранилась с самого начала — но никуда не уходила. В коде
 * очереди модерации так и стояло: «модератору надо понимать, кому отвечать
 * при отказе», то есть письмо предполагалось писать руками. На практике это
 * значит, что человек отправил снимок и не узнал о нём ничего: ни что тот
 * опубликован, ни что отклонён и почему.
 *
 * ## Тон
 *
 * Человек прислал фотографию своей еды и получает ответ от сервиса. Правила
 * те же, что везде: без оценок и без выговоров. «На снимке видно документы
 * рядом с тарелкой» — это факт и повод переснять; «вы нарушили правила» —
 * выговор за то, чего человек не имел в виду.
 *
 * Канал выбирается как у отчётов (lib/report-dispatch.ts): сначала Telegram,
 * потому что снимок чаще всего оттуда и пришёл, потом почта.
 */

import { getMailer, isEmailConfigured } from "./mailer.ts";
import { botToken, createTelegramClient, trySend } from "./telegram-api.ts";

/** Экранирование для письма: комментарий пишет человек, и в нём бывает всё. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type PhotoDecision = {
  productTitle: string;
  approved: boolean;
  /** Что модератор написал автору. Пусто — сообщение будет без пояснения. */
  comment: string | null;
};

export type PhotoRecipient = {
  email: string | null;
  telegramUserId: string | null;
};

/** Текст решения. Отдельно от отправки — чтобы его можно было проверить тестом. */
export function decisionText(decision: PhotoDecision): string {
  const head = decision.approved
    ? `Ваш снимок для «${decision.productTitle}» опубликован в каталоге. Спасибо — по таким фотографиям другие люди узнают продукт.`
    : `Ваш снимок для «${decision.productTitle}» не подошёл для каталога.`;
  const tail = decision.comment?.trim();
  if (!tail) {
    return decision.approved
      ? head
      : `${head} Это не про качество съёмки — в каталог идёт не всё, и снимок ничем не хуже оттого, что не попал.`;
  }
  return `${head}\n\n${tail}`;
}

/**
 * Отправить решение. Возвращает true, если хоть куда-то дошло.
 *
 * Не бросает: модерация не должна падать из-за недоступного канала. Не
 * дошедшее видно по `notified_at` — оно останется пустым.
 */
export async function notifyPhotoDecision(
  recipient: PhotoRecipient,
  decision: PhotoDecision,
): Promise<boolean> {
  const text = decisionText(decision);

  const token = botToken();
  if (token && recipient.telegramUserId) {
    const sent = await trySend(createTelegramClient(token), recipient.telegramUserId, text);
    if (sent) return true;
  }

  if (recipient.email && isEmailConfigured()) {
    try {
      await getMailer().send({
        to: recipient.email,
        subject: decision.approved ? "Снимок опубликован" : "Снимок не подошёл",
        text,
        // Письмо без разметки: это короткий ответ модератора, а не рассылка.
        // Абзацы — те же переносы, что и в тексте для Telegram.
        html: text.split("\n\n").map((part) => `<p>${escapeHtml(part)}</p>`).join(""),
      });
      return true;
    } catch (error) {
      console.error("не удалось написать автору снимка", error);
    }
  }

  return false;
}
