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
  /**
   * Номер позиции в `items`, которую этот вопрос уточняет.
   *
   * Без него уточнение умело только добавлять: на вопрос «какой йогурт?»
   * выбор греческого дописывал его к списку, а исходный «Йогурт» оставался,
   * и в приёме пищи оказывалось два йогурта. Когда индекс задан, выбранный
   * вариант заменяет позицию, а не дополняет список (`lib/clarify.ts`).
   */
  refinesIndex?: number;
};

export type MealAnalysis = {
  mealType: "breakfast" | "lunch" | "dinner" | "snack" | "other";
  items: AnalysisItem[];
  clarifications: Clarification[];
};

export type MealInput =
  | { kind: "text"; text: string }
  | {
      kind: "photo";
      data: Buffer;
      mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      note?: string;
      /**
       * Ключ снимка в хранилище, если он там уже лежит. Позволяет отдать
       * модели ссылку вместо самих байтов — на боевом канале тело тяжелее
       * ~32 КБ до прокси не доезжает (см. lib/ai/photo-link.ts). Без ключа
       * снимок уходит телом, как раньше: в разработке иначе никак.
       */
      photoKey?: string;
    };

/** Расход токенов на вызов — для учёта и дневных лимитов (см. lib/quota.ts). */
export type TokenUsage = { inputTokens: number; outputTokens: number };

export type MealAnalysisResult = { analysis: MealAnalysis; usage: TokenUsage };

export interface MealVisionProvider {
  analyseMeal(input: MealInput): Promise<MealAnalysisResult>;
}

/**
 * `disabled` стоит особняком от `provider_error`: это не сбой, а
 * сознательно выключенный разбор — например, пока не подано уведомление о
 * трансграничной передаче. Предлагать «попробовать через минуту» в таком
 * случае бессмысленно, и человеку надо сказать другое.
 */
export type MealAnalysisFailure = "refused" | "invalid_output" | "provider_error" | "disabled";

export class MealAnalysisError extends Error {
  readonly reason: MealAnalysisFailure;

  constructor(message: string, reason: MealAnalysisFailure) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Тексты ошибок разбора — здесь, а не рядом с каждым обработчиком. Веб и
 * Mini App держали по своей копии этой таблицы, и новая причина сбоя
 * добавилась бы в одну из них, а вторая молча отдавала бы `undefined`.
 */
export const ANALYSIS_ERRORS: Record<MealAnalysisFailure, string> = {
  refused: "Не получилось разобрать этот запрос. Попробуйте описать еду текстом.",
  invalid_output: "Разбор не удался — попробуйте ещё раз или добавьте еду вручную.",
  provider_error: "Сервис разбора сейчас недоступен. Попробуйте через минуту или добавьте еду вручную.",
  disabled: "Автоматический разбор пока выключен. Добавьте еду вручную — дневник, план и вес работают как обычно.",
};

/**
 * То же для чтения весов.
 *
 * Своя таблица, а не ANALYSIS_ERRORS: там каждая строка кончается словами
 * «добавьте еду вручную», и на экране веса это читалось как совет не по
 * адресу. Причины сбоя те же, а выход из них другой — набрать число.
 */
export const SCALE_ERRORS: Record<MealAnalysisFailure, string> = {
  refused: "Не получилось прочитать этот снимок. Введите вес числом.",
  invalid_output: "Распознавание не удалось — попробуйте другой кадр или введите вес числом.",
  provider_error: "Распознавание сейчас недоступно. Попробуйте через минуту или введите вес числом.",
  disabled: "Распознавание снимков пока выключено. Вес вводится числом — дневник и план работают как обычно.",
};

/** Тот же смысл для «что съесть дальше»: подсказки тоже ходят в AI. */
export const SUGGEST_ERRORS: Record<"disabled" | "failed", string> = {
  disabled: "Подсказки пока выключены. Дневник, план и обзор недели работают как обычно.",
  failed: "Не получилось подобрать варианты. Попробуйте через минуту.",
};
