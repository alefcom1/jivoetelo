import { AnthropicMealProvider } from "./anthropic.ts";
import { MockMealProvider } from "./mock.ts";
import type { MealVisionProvider } from "./types.ts";

let provider: MealVisionProvider | null = null;

/**
 * Выбор AI-провайдера:
 * - AI_PROVIDER=mock — детерминированный разбор без внешних вызовов;
 * - иначе Anthropic при наличии ANTHROPIC_API_KEY (модель — ANTHROPIC_MODEL,
 *   по умолчанию claude-opus-5);
 * - без ключа — mock с предупреждением в логе.
 */
export function getMealProvider(): MealVisionProvider {
  if (provider) return provider;

  const forced = process.env.AI_PROVIDER;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (forced === "mock" || !apiKey) {
    if (forced !== "mock") {
      console.warn("ANTHROPIC_API_KEY is not set — falling back to mock meal analysis provider");
    }
    provider = new MockMealProvider();
  } else {
    provider = new AnthropicMealProvider(apiKey, process.env.ANTHROPIC_MODEL);
  }
  return provider;
}

export { MealAnalysisError } from "./types.ts";
export type { AnalysisItem, Clarification, MealAnalysis, MealInput } from "./types.ts";
