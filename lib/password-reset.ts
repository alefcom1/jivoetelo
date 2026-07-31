/**
 * Правила восстановления пароля. Модуль чистый: ни базы, ни `new Date()`
 * внутри — всё приходит аргументом, поэтому «истёкшая ссылка не работает»
 * проверяется тестом, а не ожиданием часа.
 *
 * ## Четыре решения, которые стоит объяснить
 *
 * 1. **В базе лежит хеш токена, а не токен.** Как у сессий (lib/auth.ts):
 *    утечка базы не должна давать готовых ключей к чужим аккаунтам.
 *
 * 2. **Ответ формы всегда одинаковый.** «Если такой адрес есть, письмо
 *    отправлено» — и когда адрес есть, и когда его нет. Разный ответ
 *    превращает форму восстановления в проверку, зарегистрирован ли человек
 *    в дневнике питания. Это сведения, которые незачем сообщать любому.
 *
 * 3. **Час, а не сутки.** Ссылка приходит на почту и живёт в ней вечно;
 *    короткий срок ограничивает окно, в котором доступ к чужому ящику даёт
 *    доступ к аккаунту.
 *
 * 4. **Смена пароля гасит все сессии.** Человек, меняющий пароль, чаще всего
 *    делает это потому, что боится за доступ. Оставить чужой вход живым —
 *    ровно то, чего он пытался избежать.
 */

import { createHash, randomBytes } from "node:crypto";

/** Час. Обоснование — в шапке модуля. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Минимальная длина нового пароля — та же, что при регистрации. */
export const MIN_PASSWORD_LENGTH = 8;

export type ResetToken = { token: string; tokenHash: string; expiresAt: Date };

/**
 * Создаёт одноразовый токен. `bytes` передаётся аргументом, чтобы тест
 * проверял форму, не завися от случайности.
 */
export function createResetToken(now: Date, bytes: (size: number) => Uint8Array = randomBytes): ResetToken {
  const token = Buffer.from(bytes(32)).toString("base64url");
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ResetRow = {
  userId: number;
  expiresAt: Date;
  usedAt: Date | null;
};

export type ResetCheck =
  | { valid: true; userId: number }
  | { valid: false; reason: "not_found" | "expired" | "used" };

/**
 * Годится ли ссылка. Отдельно от чтения из базы, чтобы «истекла» и «уже
 * использована» были проверяемы без неё.
 *
 * Порядок проверок: одноразовость сильнее срока. Использованный токен не
 * должен оживать оттого, что час ещё не вышел.
 */
export function checkResetToken(row: ResetRow | null, now: Date): ResetCheck {
  if (!row) return { valid: false, reason: "not_found" };
  if (row.usedAt !== null) return { valid: false, reason: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: "expired" };
  return { valid: true, userId: row.userId };
}

export type PasswordProblem = "too_short" | "mismatch";

/**
 * Проверяет новый пароль. Возвращает причину отказа или `null`.
 *
 * Верхней границы длины нет намеренно: пароль всё равно уходит в хеш
 * фиксированного размера, а ограничение сверху мешает менеджерам паролей и
 * никого не защищает.
 */
export function checkNewPassword(password: string, repeat: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password !== repeat) return "mismatch";
  return null;
}

/**
 * Текст письма со ссылкой. Здесь, а не в шаблоне рядом с отправкой, по той
 * же причине, что и тексты бота в lib/bot/texts.ts: формулировки правят
 * чаще, чем механику, и удобнее, когда они лежат вместе с правилами.
 */
export function resetEmail(link: string): { subject: string; text: string; html: string } {
  const text =
    "Кто-то запросил смену пароля для этого адреса.\n\n" +
    `Ссылка действует час:\n${link}\n\n` +
    "Если это были не вы — ничего делать не нужно. Пароль останется прежним, " +
    "а ссылка сама перестанет работать через час.\n\n" +
    "«Живое Тело»\njivoetelo.ru";

  // HTML-версия нужна не для красоты: в части клиентов длинная ссылка в
  // простом тексте переносится и перестаёт быть кликабельной, а вручную
  // переписывать токен из тридцати двух байт никто не станет.
  const href = escapeHtml(link);
  const html =
    `<p>Кто-то запросил смену пароля для этого адреса.</p>` +
    `<p><a href="${href}">Сменить пароль</a></p>` +
    `<p>Ссылка действует час. Если кнопка не работает, откройте адрес вручную:<br>` +
    `<span style="word-break:break-all">${href}</span></p>` +
    `<p>Если это были не вы — ничего делать не нужно. Пароль останется прежним, ` +
    `а ссылка сама перестанет работать через час.</p>` +
    `<p>«Живое Тело» · jivoetelo.ru</p>`;

  return { subject: "Смена пароля в «Живом Теле»", text, html };
}

/** Три знака, из-за которых ссылка в атрибуте может перестать быть ссылкой. */
function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
