import type { AnalysisItem, Clarification, Confidence, MealAnalysis } from "./types.ts";
import { MealAnalysisError } from "./types.ts";
import { reconcilePer100g } from "../nutrition-sanity.ts";

const PER_100G_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kcal", "protein", "fat", "carbs", "fiber", "alcohol"],
  properties: {
    kcal: { type: "number", description: "ккал на 100 г" },
    protein: { type: "number", description: "белки, г на 100 г" },
    fat: { type: "number", description: "жиры, г на 100 г" },
    carbs: { type: "number", description: "углеводы, г на 100 г" },
    fiber: { type: "number", description: "клетчатка, г на 100 г" },
    // Спирт спрашиваем всегда: без него проверка правдоподобия видит у вина и
    // пива «калории из ниоткуда» и затирает верную оценку модели.
    alcohol: {
      type: "number",
      description: "этиловый спирт, ГРАММОВ на 100 г (не проценты крепости). Для безалкогольного — 0",
    },
  },
} as const;

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "estimatedGrams", "confidence", "per100g"],
  properties: {
    name: { type: "string", description: "Название компонента по-русски, например «Гречка отварная»" },
    estimatedGrams: { type: "number", description: "Оценка веса порции в граммах" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Уверенность в распознавании и оценке порции",
    },
    per100g: PER_100G_SCHEMA,
  },
} as const;

/** JSON-схема структурированного вывода модели (раздел 15.2 спецификации). */
export const MEAL_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mealType", "items", "clarifications"],
  properties: {
    mealType: {
      type: "string",
      enum: ["breakfast", "lunch", "dinner", "snack", "other"],
      description: "Наиболее вероятный тип приёма пищи",
    },
    items: { type: "array", items: ITEM_SCHEMA },
    clarifications: {
      type: "array",
      description: "0–2 уточняющих вопроса, только если ответ заметно влияет на итог",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options"],
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label"],
              properties: {
                label: { type: "string" },
                addItem: ITEM_SCHEMA,
              },
            },
          },
        },
      },
    },
  },
} as const;

const CONFIDENCES: Confidence[] = ["high", "medium", "low"];
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"] as const;

// Если КБЖУ не сошлись по Атуотеру, доверяем распознаванию модели на ступень меньше —
// пользователь должен честно видеть, что цифры пришлось поправить.
const DOWNGRADE_CONFIDENCE: Record<Confidence, Confidence> = {
  high: "medium",
  medium: "low",
  low: "low",
};

function clamp(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  return s.slice(0, maxLength);
}

function parseItem(raw: unknown): AnalysisItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const name = cleanString(item.name, 120);
  if (!name) return null;
  const per = (typeof item.per100g === "object" && item.per100g !== null ? item.per100g : {}) as Record<string, unknown>;
  const confidence = CONFIDENCES.includes(item.confidence as Confidence) ? (item.confidence as Confidence) : "medium";
  const sanity = reconcilePer100g({
    kcal: clamp(per.kcal, 0, 900),
    protein: clamp(per.protein, 0, 100),
    fat: clamp(per.fat, 0, 100),
    carbs: clamp(per.carbs, 0, 100),
    fiber: clamp(per.fiber, 0, 50),
    alcohol: clamp(per.alcohol, 0, 100),
  });
  return {
    name,
    estimatedGrams: clamp(item.estimatedGrams, 1, 3000),
    confidence: sanity.adjusted ? DOWNGRADE_CONFIDENCE[confidence] : confidence,
    per100g: sanity.per100g,
  };
}

/**
 * Проверяет и нормализует вывод модели. Выход модели — недоверенные данные:
 * значения зажимаются в правдоподобные пределы, лишнее отбрасывается.
 */
export function validateMealAnalysis(raw: unknown): MealAnalysis {
  if (typeof raw !== "object" || raw === null) {
    throw new MealAnalysisError("Analysis is not an object", "invalid_output");
  }
  const data = raw as Record<string, unknown>;

  const items = (Array.isArray(data.items) ? data.items : [])
    .map(parseItem)
    .filter((item): item is AnalysisItem => item !== null)
    .slice(0, 20);
  if (items.length === 0) {
    throw new MealAnalysisError("No recognizable items in analysis", "invalid_output");
  }

  const clarifications: Clarification[] = (Array.isArray(data.clarifications) ? data.clarifications : [])
    .map((raw): Clarification | null => {
      if (typeof raw !== "object" || raw === null) return null;
      const c = raw as Record<string, unknown>;
      const question = cleanString(c.question, 200);
      if (!question) return null;
      const options = (Array.isArray(c.options) ? c.options : [])
        .map((rawOption) => {
          if (typeof rawOption !== "object" || rawOption === null) return null;
          const o = rawOption as Record<string, unknown>;
          const label = cleanString(o.label, 80);
          if (!label) return null;
          const addItem = o.addItem ? parseItem(o.addItem) : null;
          return addItem ? { label, addItem } : { label };
        })
        .filter((o): o is NonNullable<typeof o> => o !== null)
        .slice(0, 5);
      if (options.length < 2) return null;
      return { question, options };
    })
    .filter((c): c is Clarification => c !== null)
    .slice(0, 2);

  return {
    mealType: MEAL_TYPES.includes(data.mealType as (typeof MEAL_TYPES)[number])
      ? (data.mealType as MealAnalysis["mealType"])
      : "other",
    items,
    clarifications,
  };
}
