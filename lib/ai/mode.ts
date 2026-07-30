import { hasAnthropicCredentials } from "./client.ts";

export type AiMode = "anthropic" | "mock" | "off";

/**
 * Режим работы AI. Один на разбор еды и на подсказки: раньше эти два места
 * решали каждое за себя и могли разойтись — подсказки продолжали бы выдумывать
 * варианты там, где разбор уже выключен.
 *
 * Значения `AI_PROVIDER`:
 * - пусто — Anthropic, если есть учётные данные;
 * - `off` — разбор и подсказки выключены, экраны честно об этом говорят;
 * - `mock` — детерминированный ответ без внешних вызовов, для разработки;
 * - `demo` — то же самое, но осознанно и в бою (показать продукт вживую).
 *
 * Ключевая тонкость — `mock` в продакшене. Mock отвечает одним и тем же
 * разбором на что угодно: сфотографируй салат, получишь сырники. Для тестов
 * это ровно то, что нужно, а в бою — выдуманные калории, оформленные точно
 * как настоящие, на сервисе о питании. Поэтому в продакшене `mock`
 * превращается в `off`; кому действительно нужна живая демонстрация, пишет
 * `demo` и делает это осознанно.
 *
 * Отсутствие учётных данных в продакшене — тоже не повод выдумывать: `off`.
 */
export function resolveAiMode(): AiMode {
  const forced = process.env.AI_PROVIDER?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (forced === "off") return "off";
  if (forced === "demo") return "mock";

  if (forced === "mock") {
    if (!isProduction) return "mock";
    console.warn("AI_PROVIDER=mock в продакшене выключает разбор, а не подделывает его. Нужна живая демонстрация — AI_PROVIDER=demo.");
    return "off";
  }

  if (!hasAnthropicCredentials()) {
    if (isProduction) {
      console.warn("Нет учётных данных Anthropic — разбор выключен (режим off).");
      return "off";
    }
    return "mock";
  }

  return "anthropic";
}
