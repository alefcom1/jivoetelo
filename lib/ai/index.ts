import { AnthropicMealProvider } from "./anthropic.ts";
import { DisabledMealProvider } from "./disabled.ts";
import { MockMealProvider } from "./mock.ts";
import { resolveAiMode } from "./mode.ts";
import type { MealVisionProvider } from "./types.ts";

let provider: MealVisionProvider | null = null;

/**
 * Выбор AI-провайдера — по режиму из `resolveAiMode`:
 * - `anthropic` — учётные данные есть: ANTHROPIC_API_KEY напрямую либо
 *   ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN через прокси-воркер
 *   (docs/ai-proxy.md); модель разбор фото/текста выбирает сам по операции
 *   (см. resolveModel в lib/ai/client.ts) — по умолчанию claude-sonnet-5
 *   для фото и claude-haiku-4-5-20251001 для текста, переопределяются
 *   ANTHROPIC_MODEL_VISION / ANTHROPIC_MODEL_TEXT, а старый ANTHROPIC_MODEL
 *   по-прежнему перекрывает всё разом;
 * - `mock` — детерминированный разбор без внешних вызовов, для разработки;
 * - `off` — честный отказ с предложением ввести еду вручную.
 */
export function getMealProvider(): MealVisionProvider {
  if (provider) return provider;

  switch (resolveAiMode()) {
    case "mock": provider = new MockMealProvider(); break;
    case "off": provider = new DisabledMealProvider(); break;
    default: provider = new AnthropicMealProvider();
  }
  return provider;
}

export { resolveAiMode } from "./mode.ts";
export { ANALYSIS_ERRORS, MealAnalysisError, SCALE_ERRORS, SUGGEST_ERRORS } from "./types.ts";
export type { AnalysisItem, Clarification, MealAnalysis, MealAnalysisResult, MealInput, TokenUsage } from "./types.ts";
