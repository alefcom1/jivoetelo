import { normalizeEmail } from "../email.ts";

/**
 * Варианты ответа на вопрос «сколько клиентов ведёте сейчас».
 * Используется и в форме, и в проверке. Порядок говорит о статусе специалиста:
 * от начинающего к практикующему.
 */
export const CLIENTS_COUNT_OPTIONS = [
  "нет, только начинаю",
  "до 5",
  "5–15",
  "15–50",
  "больше 50",
] as const;

export type ClientsCountOption = (typeof CLIENTS_COUNT_OPTIONS)[number];

/**
 * Сырые строки из формы: всё, что приходит от браузера, до проверки.
 * Нет никаких гарантий на длину, формат, пробелы.
 */
export type ProApplicationInput = {
  email: string;
  name: string;
  specialization?: string;
  city?: string;
  clientsCount?: string;
  currentTools?: string;
  comment?: string;
  consent?: boolean;
};

/**
 * Проверенные и нормализованные значения.
 * - Пробелы срезаны, длины кроены по пределам.
 * - Адрес приведён к каноническому виду (trim + lowercase).
 * - Обязательные поля присутствуют, необязательные могут быть пусты.
 */
export type ProApplicationFields = {
  email: string;
  name: string;
  specialization: string;
  city: string;
  clientsCount: string;
  currentTools: string;
  comment: string;
  consent: boolean;
};

/**
 * Коды ошибок валидации. Размеченное объединение: каждый код соответствует
 * конкретной проблеме в формате, которая может быть показана пользователю
 * без деталей реализации.
 */
export type ProApplicationError = "invalid_email" | "no_name" | "no_consent";

export type ProApplicationResult =
  | { ok: true; fields: ProApplicationFields }
  | { ok: false; error: ProApplicationError };

/**
 * Проверяет и нормализует заявку в пилотную группу Про.
 *
 * Обрезка вместо отказа (на длинных полях) — это умолчание в сторону пользователя:
 * человек потратил время на заполнение, и не должен потерять введённое из-за
 * того, что комментарий получился пространнее, чем допускает поле.
 *
 * Обязательны только email, имя и согласие. Остальное можно не заполнять.
 */
export function validateApplication(input: ProApplicationInput): ProApplicationResult {
  // Email — проверяем формат и нормализуем адрес.
  const email = normalizeEmail(input.email);
  if (!email) {
    return { ok: false, error: "invalid_email" };
  }

  // Имя — обязательно, обрезаем пробелы и лимитируем длину до 100 символов.
  const name = (input.name ?? "").trim().slice(0, 100);
  if (!name) {
    return { ok: false, error: "no_name" };
  }

  // Согласие — проверяем явно, без умолчаний. Это персональные данные,
  // браузер может быть скомпрометирован, поэтому не доверяем молчанию.
  if (!input.consent) {
    return { ok: false, error: "no_consent" };
  }

  // Остальные поля — необязательны, обрезаем пробелы по краям и кроим длину.
  // Ограничения выбраны с запасом: они вмещают разумные ответы, но при
  // случайно переданном очень длинном тексте не выбрасывают человека.
  const specialization = (input.specialization ?? "").trim().slice(0, 100);
  const city = (input.city ?? "").trim().slice(0, 100);
  const currentTools = (input.currentTools ?? "").trim().slice(0, 300);
  const comment = (input.comment ?? "").trim().slice(0, 1000);

  // Значение из выпадающего списка сверяем со списком же: браузер отправит
  // что угодно, а вариант «прочее» нам потом не с чем сопоставить. Сверяем
  // именно обрезанное значение — иначе « до 5» с пробелом молча превращалось
  // бы в «не указано».
  const clientsCountRaw = (input.clientsCount ?? "").trim();
  const clientsCount = (CLIENTS_COUNT_OPTIONS as readonly string[]).includes(clientsCountRaw)
    ? clientsCountRaw
    : "";

  return {
    ok: true,
    fields: {
      email,
      name,
      specialization,
      city,
      clientsCount,
      currentTools,
      comment,
      consent: true,
    },
  };
}
