import { AnthropicMealProvider } from "./anthropic.ts";
import { hasAnthropicCredentials } from "./client.ts";
import { MockMealProvider } from "./mock.ts";
import type { MealVisionProvider } from "./types.ts";

let provider: MealVisionProvider | null = null;

/**
 * Выбор AI-провайдера:
 * - AI_PROVIDER=mock — детерминированный разбор без внешних вызовов;
 * - иначе Anthropic при наличии учётных данных: ANTHROPIC_API_KEY напрямую
 *   либо ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN через прокси-воркер
 *   (docs/ai-proxy.md); модель — ANTHROPIC_MODEL, по умолчанию claude-opus-5;
 * - без учётных данных — mock с предупреждением в логе.
 */
export function getMealProvider(): MealVisionProvider {
  if (provider) return provider;

  const forced = process.env.AI_PROVIDER;

  if (forced === "mock" || !hasAnthropicCredentials()) {
    if (forced !== "mock") {
      console.warn("No Anthropic credentials — falling back to mock meal analysis provider");
    }
    provider = new MockMealProvider();
  } else {
    provider = new AnthropicMealProvider(process.env.ANTHROPIC_MODEL);
  }
  return provider;
}

export { MealAnalysisError } from "./types.ts";
export type { AnalysisItem, Clarification, MealAnalysis, MealAnalysisResult, MealInput, TokenUsage } from "./types.ts";
