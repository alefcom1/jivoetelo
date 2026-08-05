import Anthropic from "@anthropic-ai/sdk";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";
import type { ModelOperation } from "../quota-policy.ts";

/**
 * Единая точка создания клиента Anthropic для всех AI-функций.
 *
 * Два режима работы, оба поддерживаются SDK из коробки:
 *  - напрямую: ANTHROPIC_API_KEY;
 *  - через прокси-воркер: ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN,
 *    где токен — общий PROXY_SECRET воркера, а настоящий ключ живёт только
 *    на воркере. См. docs/ai-proxy.md.
 *
 * pipelining: 0 отключает переиспользование keep-alive соединений. Без этого
 * долгоживущий пул может держать сокет, который удалённая сторона уже
 * закрыла, — следующий запрос падает с ECONNRESET. Проверено на боевом
 * прокси techperevod.
 *
 * ## Почему свой fetch, а не fetchOptions.dispatcher
 *
 * Раньше агент отдавался глобальному `fetch` через `fetchOptions.dispatcher`.
 * Способ официальный, но он молча предполагает, что undici один. А их два:
 * в Node 22 встроен undici 6, а пакетом установлен undici 8. Обработчик
 * запроса у них разный — в шестой версии `onConnect/onHeaders/onData`, в
 * восьмой `onRequestStart/onResponseStart/...`. Встроенный fetch собирал
 * обработчик по-старому и звал `dispatch` у нашего агента, а тот проверял
 * его по-новому и отказывал:
 *
 *     InvalidArgumentError: invalid onRequestStart method
 *
 * Наружу это выглядело как `Error: Connection error` без статуса и заголовков
 * — то есть как проблема сети, хотя ни одного пакета не ушло.
 *
 * Поэтому fetch берём из того же пакета, что и агент: тогда обе половины
 * транспорта заведомо одной версии, чем бы ни оказался снабжён Node.
 */
const upstreamAgent = new UndiciAgent({ pipelining: 0, keepAliveTimeout: 1 });

/**
 * Транспорт всех обращений к модели. Вынесен отдельно, чтобы его можно было
 * проверить тестом без сети и без ключей — см. tests/ai-transport.test.mjs.
 */
export const upstreamFetch = ((input: unknown, init?: unknown) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: upstreamAgent,
  })) as unknown as typeof fetch;

/**
 * Сколько ждать ответа модели — по операциям, а не одним числом на всё.
 *
 * ## Почему не одно число
 *
 * Один общий предел здесь уже стоил работающего разбора фото. У SDK своего
 * умолчания нет в привычном смысле: не задав таймаут, получаешь десять минут
 * (calculateNonstreamingTimeout при max_tokens = 16000). Это слишком много
 * для человека, который смотрит на «Разбираем…», и сорок секунд казались
 * разумной заменой — пока не выяснилось, что операции разные.
 *
 * Разбор текста и подсказки идут на haiku без раздумий и укладываются в
 * секунды. Разбор фото идёт на sonnet со зрением и `effort: "medium"`: модель
 * думает, и полминуты для неё — норма, а не сбой. Сорок секунд обрубали её
 * ровно посередине, и снаружи это выглядело как «разбор по фото не работает»
 * при исправном разборе текста.
 *
 * ## Как выбраны значения
 *
 * Не измерением — измерить неоткуда, ключ живёт на прокси. Взяты с запасом
 * от наблюдаемого: у фото запас кратный, у текста и подсказок — на порядок
 * больше обычного времени ответа. Ошибиться в большую сторону здесь дешевле:
 * цена лишнего ожидания — потраченная минута, цена короткого предела — не
 * работающая функция.
 *
 * Клиентский предел (ANALYZE_TIMEOUT_MS в app/tg/api.ts) держится выше
 * серверного, чтобы человек увидел настоящую ошибку сервера, а не свою.
 */
const TIMEOUTS: Record<ModelOperation, number> = {
  analyze_photo: 120_000,
  analyze_text: 40_000,
  suggest: 40_000,
  // Прочитать четыре цифры — работа зрения, а не разбора: ответ приходит за
  // секунды. Держать здесь двухминутный предел значило бы заставлять человека
  // столько же смотреть на крутилку, когда до модели просто не достучались.
  read_scale: 40_000,
};

/**
 * Сколько всего может занять операция вместе с повторами.
 *
 * ## Почему это считается, а не задаётся на глаз
 *
 * Между приложением и человеком стоит nginx со своим `proxy_read_timeout`
 * (deploy/nginx/jivoetelo-proxy.conf). Если приложение готово ждать модель
 * дольше, чем nginx готов ждать приложение, то nginx обрывает соединение
 * ровно в тот момент, когда всё ещё могло получиться, — и обрывает молча,
 * пятьсот четвёртой, без единой строки в нашем логе.
 *
 * Ровно это и вышло с разбором фото: предел 120 секунд плюс одна повторная
 * попытка — это до 240 секунд работы, при 120 секундах терпения у nginx.
 * Разбор текста тех же настроек не замечал: haiku отвечает за секунды и до
 * второй попытки не доходит никогда.
 *
 * Отсюда правило: у долгих операций повторов нет. Повтор защищает от
 * случайного обрыва связи, а двухминутный запрос обрывается не случайно —
 * чаще всего он просто долгий, и вторая попытка лишь удваивает ожидание.
 */
const RETRIES: Record<ModelOperation, number> = {
  analyze_photo: 0,
  analyze_text: 1,
  suggest: 1,
  read_scale: 1,
};

export function timeoutFor(operation: ModelOperation): number {
  return TIMEOUTS[operation] ?? TIMEOUTS.analyze_photo;
}

export function retriesFor(operation: ModelOperation): number {
  return RETRIES[operation] ?? 0;
}

/**
 * Сколько операция может занять в худшем случае. Это число обязано быть
 * меньше `proxy_read_timeout` у nginx — проверяется тестом, потому что
 * увидеть расхождение глазами в двух разных файлах не получилось ни разу.
 */
export function worstCaseMs(operation: ModelOperation): number {
  return timeoutFor(operation) * (retriesFor(operation) + 1);
}

export function createAnthropicClient(): Anthropic {
  // apiKey/authToken/baseURL SDK читает из окружения сам; передаём только
  // транспорт, чтобы не дублировать логику выбора учётных данных.
  //
  // Умолчание клиента — самый щедрый предел из всех. Место вызова уточняет
  // его своим (см. timeoutFor): забытый вызов тогда окажется медленным, а не
  // сломанным, и это верная сторона для ошибки.
  return new Anthropic({ fetch: upstreamFetch, timeout: TIMEOUTS.analyze_photo, maxRetries: 0 });
}

/** Есть ли у сервера учётные данные для реальных вызовов. */
export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * Модель под задачу, а не одна на всё. Раньше все три AI-операции ходили на
 * claude-opus-5 — самую дорогую модель ($5/$25 за млн токенов), — хотя
 * дорога она нужна только одной из трёх:
 *  - разбор фото (analyze_photo) — claude-sonnet-5. Зрение здесь и есть
 *    продукт: экономить на нём нельзя, но Opus для этой задачи избыточен;
 *  - разбор текста (analyze_text) — claude-haiku-4-5-20251001. «Борщ и кусок хлеба»
 *    в структурированный JSON — простая задача;
 *  - подсказки «что съесть дальше» (suggest) — claude-haiku-4-5-20251001. Арифметику
 *    остатка дня считает наш детерминированный слой (buildPrompt в
 *    suggest.ts), модель только формулирует варианты под готовые цифры.
 */
/**
 * Умолчания моделей по операциям.
 *
 * Идентификаторы должны быть теми, что принимает API, а не «читаемыми
 * именами». У части моделей псевдоним без даты существует, у части — нет:
 * `claude-haiku-4-5` API не знает, правильный идентификатор датированный.
 * Здесь на этом уже споткнулись — подсказки и разбор текста молча падали с
 * ошибкой провайдера, а тест этого не ловил, потому что сверял константу
 * саму с собой (см. tests/ai-model.test.mjs).
 */
const DEFAULT_MODEL_BY_OPERATION: Record<ModelOperation, string> = {
  analyze_photo: "claude-sonnet-5",
  analyze_text: "claude-haiku-4-5-20251001",
  suggest: "claude-haiku-4-5-20251001",
  // Не haiku, хотя задача выглядит крошечной: семисегментные цифры под бликом
  // на тёмном стекле — не «прочитать текст», а разобрать плохую картинку, и
  // цена ошибки здесь выше, чем экономия на модели.
  read_scale: "claude-sonnet-5",
};

const MODEL_ENV_BY_OPERATION: Record<ModelOperation, string> = {
  analyze_photo: "ANTHROPIC_MODEL_VISION",
  analyze_text: "ANTHROPIC_MODEL_TEXT",
  suggest: "ANTHROPIC_MODEL_SUGGEST",
  read_scale: "ANTHROPIC_MODEL_SCALE",
};

/**
 * Модель для конкретной AI-операции. Порядок приоритета:
 *  1. Старый ANTHROPIC_MODEL — обратная совместимость. Если задан, он
 *     перекрывает все три операции разом, как было до того, как модель
 *     развели по задачам: у кого он уже стоит в проде, ничего не сломается.
 *  2. Переменная под конкретную операцию (ANTHROPIC_MODEL_VISION,
 *     ANTHROPIC_MODEL_TEXT, ANTHROPIC_MODEL_SUGGEST).
 *  3. Разумное умолчание для операции.
 */
export function resolveModel(operation: ModelOperation): string {
  const legacy = process.env.ANTHROPIC_MODEL?.trim();
  if (legacy) return legacy;
  const perOperation = process.env[MODEL_ENV_BY_OPERATION[operation]]?.trim();
  return perOperation || DEFAULT_MODEL_BY_OPERATION[operation];
}

/** Серверные фолбэки при отказе классификаторов поддерживаются не всеми моделями. */
export function supportsFallbacks(model: string): boolean {
  return model.startsWith("claude-opus-5") || model.startsWith("claude-fable");
}

/**
 * Параметр `effort` в `output_config` понимают не все модели.
 *
 * Haiku 4.5 отвечает на него `400 invalid_request_error: This model does not
 * support the effort parameter`, и запрос не выполняется вовсе. Мы слали его
 * всем одинаково — из-за чего молчали и подсказки, и разбор текста.
 *
 * Проверка по началу идентификатора, а не по списку: список пришлось бы
 * дописывать к каждой новой модели, и забытая строка снова означала бы
 * тихий отказ. Незнакомой модели `effort` не отправляем — потерять качество
 * ответа не так больно, как получить 400.
 */
export function supportsEffort(model: string): boolean {
  return model.startsWith("claude-opus-5")
    || model.startsWith("claude-sonnet-5")
    || model.startsWith("claude-fable-5");
}

export type TokenUsage = { inputTokens: number; outputTokens: number };

export function readUsage(message: { usage?: { input_tokens?: number; output_tokens?: number } }): TokenUsage {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  };
}
