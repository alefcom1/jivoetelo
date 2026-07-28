// Типы AI-разбора приёма пищи — структура по разделу 15.2 спецификации.
// Модель возвращает состав, веса и приблизительные значения на 100 г,
// итоговые КБЖУ считает наш код (lib/nutrition.ts).

export type Confidence = "high" | "medium" | "low";

export type AnalysisItem = {
  name: string;
  estimatedGrams: number;
  confidence: Confidence;
  per100g: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
  };
};

export type ClarificationOption = {
  label: string;
  /**
   * Позиция, которую нужно добавить при выборе этого варианта
   * (например, «заправка на масле» → +10 г оливкового масла).
   * Отсутствует у вариантов вида «без заправки».
   */
  addItem?: AnalysisItem;
};

export type Clarification = {
  question: string;
  options: ClarificationOption[];
};

export type MealAnalysis = {
  mealType: "breakfast" | "lunch" | "dinner" | "snack" | "other";
  items: AnalysisItem[];
  clarifications: Clarification[];
};

export type MealInput =
  | { kind: "text"; text: string }
  | { kind: "photo"; data: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; note?: string };

/** Расход токенов на вызов — для учёта и дневных лимитов (см. lib/quota.ts). */
export type TokenUsage = { inputTokens: number; outputTokens: number };

export type MealAnalysisResult = { analysis: MealAnalysis; usage: TokenUsage };

export interface MealVisionProvider {
  analyseMeal(input: MealInput): Promise<MealAnalysisResult>;
}

export type MealAnalysisFailure = "refused" | "invalid_output" | "provider_error";

export class MealAnalysisError extends Error {
  readonly reason: MealAnalysisFailure;

  constructor(message: string, reason: MealAnalysisFailure) {
    super(message);
    this.reason = reason;
  }
}
