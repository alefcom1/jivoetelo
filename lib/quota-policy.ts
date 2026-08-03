/**
 * Политика бесплатного доступа: какие дневные лимиты действуют и как о них
 * говорить. Здесь нет обращений к базе — только правила, поэтому модуль
 * тестируется напрямую и переиспользуется на клиенте.
 *
 * Все функции сервиса бесплатны. Лимиты ниже — не монетизация, а защита от
 * неумеренного расхода: они выставлены заметно выше реального дневного
 * сценария (3–5 приёмов пищи), так что обычный пользователь их не заметит.
 *
 * Поле users.plan — задел на будущее: когда появятся тарифы, достаточно
 * добавить сюда строку с другими числами, не трогая остальной код.
 */

/**
 * Операции, которые обслуживает языковая модель Anthropic. Отдельно от
 * AiOperation, потому что у них есть то, чего нет у расшифровки: модель,
 * таймаут, число повторов и цена за токен (lib/ai/client.ts).
 */
export type ModelOperation = "analyze_photo" | "analyze_text" | "suggest";

/**
 * Всё, что считает предохранитель расхода. Расшифровка речи денег не стоит —
 * она идёт на нашем же сервере, — но лимит частоты ей нужен не меньше:
 * точка приёма мегабайтных файлов без ограничения занимает сервер целиком.
 */
export type AiOperation = ModelOperation | "transcribe";
export type Plan = "free" | "premium";
export type PlanLimits = Record<AiOperation, number>;

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  // Сейчас все пользователи здесь.
  free: { analyze_photo: 20, analyze_text: 40, suggest: 15, transcribe: 60 },
  // Заготовка: тариф существует в коде, но никому не выдаётся.
  premium: { analyze_photo: 100, analyze_text: 200, suggest: 60, transcribe: 300 },
};

export const OPERATION_LABELS: Record<AiOperation, string> = {
  analyze_photo: "разборов по фото",
  analyze_text: "разборов по описанию",
  suggest: "подборов «что съесть дальше»",
  transcribe: "расшифровок голосом",
};

/**
 * Минимальный интервал между двумя обращениями к ОДНОЙ операции — защита от
 * скриптового перебора. Считается пооперационно: нормально сохранить еду и
 * сразу спросить совет, а вот долбить один эндпоинт подряд — нет. Общий
 * потолок расхода всё равно держат дневные лимиты.
 */
export const MIN_INTERVAL_MS = 3000;

/**
 * Цены за миллион токенов — по модели, которая реально обслуживает операцию
 * (см. resolveModel в lib/ai/client.ts). Раньше здесь была одна ставка Opus
 * на всё, и это было не просто неточно: дневной предохранитель считал расход
 * впятеро больше настоящего и обрубал разбор задолго до реального потолка —
 * то есть съедал ровно ту экономию, ради которой модели и разводились.
 *
 * Ставки прейскурантные, без вводных скидок: предохранитель должен
 * ошибаться в сторону осторожности, а не оптимизма.
 */
const PRICE_PER_MTOK: Record<AiOperation, { input: number; output: number }> = {
  analyze_photo: { input: 3, output: 15 }, // Sonnet 5
  analyze_text: { input: 1, output: 5 }, // Haiku 4.5
  suggest: { input: 1, output: 5 }, // Haiku 4.5
  // Своя установка на нашем же сервере: денег наружу не уходит вовсе, и
  // токенов у неё нет. Ноль здесь — не заглушка, а точная цена.
  transcribe: { input: 0, output: 0 },
};

/** Самая дорогая из ставок — умолчание, когда операция неизвестна. */
const PRICE_FALLBACK = { input: 5, output: 25 };

export type TokenUsage = { inputTokens: number; outputTokens: number };

/**
 * Операцию передавать необязательно: без неё считаем по ставке Opus. Это
 * сознательный перестраховочный путь для вызовов, где операция не известна, —
 * завысить оценку безопаснее, чем занизить.
 */
export function estimateCostUsd(usage: TokenUsage, operation?: AiOperation): number {
  const price = (operation && PRICE_PER_MTOK[operation]) || PRICE_FALLBACK;
  return (usage.inputTokens / 1_000_000) * price.input + (usage.outputTokens / 1_000_000) * price.output;
}

/** Глобальный дневной потолок расходов на AI, USD. Переопределяется env. */
export function globalDailyBudgetUsd(): number {
  const raw = Number(process.env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

export function normalizePlan(plan: string | null | undefined): Plan {
  return plan === "premium" ? "premium" : "free";
}

export type QuotaDenial =
  | { allowed: false; reason: "daily_limit"; used: number; limit: number; operation: AiOperation }
  | { allowed: false; reason: "too_fast" }
  | { allowed: false; reason: "service_budget" };

export type QuotaDecision = { allowed: true; used: number; limit: number } | QuotaDenial;

/**
 * Сообщения об отказе. Формулировки поддерживающие и без обвинений
 * (языковые правила, раздел 4.3 спеки): лимит — свойство сервиса, а не
 * оценка пользователя.
 */
export function quotaMessage(denial: QuotaDenial): string {
  switch (denial.reason) {
    case "too_fast":
      return "Секунду — предыдущий запрос ещё обрабатывается. Попробуйте ещё раз через пару секунд.";
    case "daily_limit":
      return `На сегодня доступные ${OPERATION_LABELS[denial.operation]} закончились (${denial.limit} в день). Лимит обновится завтра, а записать еду вручную можно без ограничений.`;
    case "service_budget":
      return "Сервис распознавания сегодня работает с повышенной нагрузкой. Попробуйте позже или добавьте еду вручную — это доступно всегда.";
  }
}
