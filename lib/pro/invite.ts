/**
 * Коды приглашения специалиста.
 *
 * Приглашение идёт от специалиста к клиенту: специалист получает код, называет
 * его клиенту любым способом, каким они и так общаются, клиент вводит код у
 * себя. Обратное направление — «клиент ищет специалиста в базе» — потребовало
 * бы каталога специалистов, а он предполагает модерацию, отзывы и рейтинг,
 * то есть отдельный продукт. Приглашение по коду не требует ничего.
 *
 * Почему не ссылка с кодом внутри. Ссылку пересылают, и она попадает в чат,
 * куда её не собирались класть. Код из восьми знаков нужно набрать руками —
 * это одна лишняя секунда для того, кому он предназначен, и заметное
 * препятствие для случайного распространения.
 *
 * Модуль чистый: генерация принимает источник случайности, срок считается от
 * переданного времени. Ни базы, ни `Date.now()`.
 */

/**
 * Срок жизни кода. Час, а не пятнадцать минут как у привязки Telegram: там
 * человек переключается между двумя своими экранами, здесь — договаривается
 * с другим человеком, и «код истёк, пока мы созванивались» было бы обидной
 * мелочью. Больше часа тоже незачем: неиспользованный код к вечеру — это
 * забытый код.
 */
export const INVITE_TTL_MS = 60 * 60 * 1000;

/** Длина кода в знаках. */
export const INVITE_CODE_LENGTH = 8;

/**
 * Алфавит, из которого не собрать пару похожих знаков. Инвариант именно
 * такой: не «нет цифры 8», а «из пары `8`/`B` в алфавите остался один».
 * Убраны `0`, `1`, `5`, `B`, `I`, `L`, `O`, `S`, `V`, `Z`.
 *
 * Код чаще всего произносят вслух или пересылают сообщением, и цена ошибки
 * здесь не «не подошёл», а «подошёл к чужому приглашению». 26 знаков на
 * восьми позициях — это 2×10^11 вариантов, запаса более чем достаточно.
 */
export const INVITE_ALPHABET = "ACDEFGHJKMNPQRTUWXY2346789";

/**
 * Байты выше этой границы отбрасываются. Без этого первые знаки алфавита
 * выпадали бы чаще остальных — 256 не делится на 26, — и перебор дешевел бы
 * ровно на эту неравномерность.
 */
export const UNBIASED_LIMIT = Math.floor(256 / INVITE_ALPHABET.length) * INVITE_ALPHABET.length;

/** Сколько раз просим у источника новую порцию, прежде чем сдаться. */
const MAX_DRAWS = 16;

export type InviteCode = { code: string; expiresAt: Date };

/**
 * Создаёт код. `randomBytes` передаётся аргументом, чтобы тест мог проверить
 * форму кода, не завися от случайности.
 *
 * Значения выше `UNBIASED_LIMIT` отбрасываются — см. комментарий там же.
 */
export function createInviteCode(now: Date, randomBytes: (size: number) => Uint8Array): InviteCode {
  let code = "";
  // Число попыток ограничено, потому что цикл здесь управляется чужой
  // функцией. С настоящим `randomBytes` он заканчивается за один-два захода,
  // но источник, отдающий только отбрасываемые значения, повесил бы процесс
  // молча — а виснущий сервер отлаживают дольше, чем падающий.
  for (let attempt = 0; attempt < MAX_DRAWS && code.length < INVITE_CODE_LENGTH; attempt += 1) {
    for (const byte of randomBytes(INVITE_CODE_LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
      if (code.length === INVITE_CODE_LENGTH) break;
    }
  }
  if (code.length < INVITE_CODE_LENGTH) {
    throw new Error("createInviteCode: источник случайности не дал пригодных значений");
  }
  return { code, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) };
}

/**
 * Приводит введённый код к каноническому виду или возвращает `null`.
 *
 * Пробелы и дефисы вырезаем: код диктуют группами, и «ACDE-FGHJ» — это тот же
 * код. Регистр поднимаем. Всё остальное — отказ; подставлять похожие знаки
 * (`0` вместо `O`) мы намеренно не будем, потому что молчаливое исправление
 * ввода в механизме доступа к чужим данным — плохой обмен.
 */
export function normalizeInviteCode(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length !== INVITE_CODE_LENGTH) return null;
  for (const char of cleaned) {
    if (!INVITE_ALPHABET.includes(char)) return null;
  }
  return cleaned;
}

export type InviteRow = {
  code: string;
  specialistUserId: number;
  expiresAt: Date;
  usedAt: Date | null;
};

export type InviteCheck =
  | { valid: true }
  | { valid: false; reason: "not_found" | "expired" | "used" | "self" };

/**
 * Годится ли приглашение. Отдельно от чтения из базы, чтобы условия «истёк» и
 * «уже использован» были проверяемы без неё.
 */
export function checkInvite(invite: InviteRow | null, clientUserId: number, now: Date): InviteCheck {
  if (!invite) return { valid: false, reason: "not_found" };
  if (invite.usedAt !== null) return { valid: false, reason: "used" };
  if (invite.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: "expired" };
  // Специалист не приглашает сам себя: связь с самим собой не даёт ничего,
  // кроме строки в журнале и путаницы в списке клиентов.
  if (invite.specialistUserId === clientUserId) return { valid: false, reason: "self" };
  return { valid: true };
}
