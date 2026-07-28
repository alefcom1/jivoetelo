import Anthropic from "@anthropic-ai/sdk";
import { Agent as UndiciAgent } from "undici";

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

export const DEFAULT_MODEL = "claude-opus-5";

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
