// Уверенность разбора еды — раздел «три отличия от макета» спецификации
// Mini App v2 (docs/miniapp-v2.md). Процент уверенности («92%») не
// показываем: модель такого числа не сообщает, и оно было бы выдуманным.
// Вместо процента — три уровня словами, а там, где уверенность не «высокая»,
// под итоговым числом идёт диапазон и (на экране) уточняющий вопрос,
// который его сузит. Уверенный разбор — просто число, без диапазона.

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

/**
 * Ширина диапазона неопределённости в долях от значения. Ориентир для `low` —
 * пример из спецификации: «реальная неопределённость в тридцать процентов».
 * Для `medium` берём половину: неопределённость есть, но не критичная.
 */
const CONFIDENCE_SPREAD: Record<Confidence, number> = {
  high: 0,
  medium: 0.15,
  low: 0.3,
};

/** Худшая (наименее уверенная) оценка среди позиций разбора — она и определяет итог. */
export function overallConfidence(levels: Confidence[]): Confidence {
  if (levels.some((level) => level === "low")) return "low";
  if (levels.some((level) => level === "medium")) return "medium";
  return "high";
}

/**
 * Диапазон вокруг значения. `null` для «высокой» уверенности — там диапазон
 * не нужен, показываем просто число.
 */
export function confidenceRange(value: number, confidence: Confidence): { min: number; max: number } | null {
  const spread = CONFIDENCE_SPREAD[confidence];
  if (spread <= 0) return null;
  return {
    min: Math.round(value * (1 - spread)),
    max: Math.round(value * (1 + spread)),
  };
}
