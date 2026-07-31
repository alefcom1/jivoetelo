import Anthropic from "@anthropic-ai/sdk";
import { Agent as UndiciAgent } from "undici";
import type { AiOperation } from "../quota-policy.ts";

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
 * прокси techperevod; fetchOptions.dispatcher — официально поддерживаемый
 * SDK способ подменить transport для Node.js fetch (undici).
 */
const upstreamAgent = new UndiciAgent({ pipelining: 0, keepAliveTimeout: 1 });

export function createAnthropicClient(): Anthropic {
  // apiKey/authToken/baseURL SDK читает из окружения сам; передаём только
  // диспетчер, чтобы не дублировать логику выбора учётных данных.
  return new Anthropic({ fetchOptions: { dispatcher: upstreamAgent } });
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
const DEFAULT_MODEL_BY_OPERATION: Record<AiOperation, string> = {
  analyze_photo: "claude-sonnet-5",
  analyze_text: "claude-haiku-4-5-20251001",
  suggest: "claude-haiku-4-5-20251001",
};

const MODEL_ENV_BY_OPERATION: Record<AiOperation, string> = {
  analyze_photo: "ANTHROPIC_MODEL_VISION",
  analyze_text: "ANTHROPIC_MODEL_TEXT",
  suggest: "ANTHROPIC_MODEL_SUGGEST",
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
export function resolveModel(operation: AiOperation): string {
  const legacy = process.env.ANTHROPIC_MODEL?.trim();
  if (legacy) return legacy;
  const perOperation = process.env[MODEL_ENV_BY_OPERATION[operation]]?.trim();
  return perOperation || DEFAULT_MODEL_BY_OPERATION[operation];
}

/** Серверные фолбэки при отказе классификаторов поддерживаются не всеми моделями. */
export function supportsFallbacks(model: string): boolean {
  return model.startsWith("claude-opus-5") || model.startsWith("claude-fable");
}

export type TokenUsage = { inputTokens: number; outputTokens: number };

export function readUsage(message: { usage?: { input_tokens?: number; output_tokens?: number } }): TokenUsage {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  };
}
