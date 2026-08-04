/**
 * Состав тела и здоровый вес: две вещи, которые ИМТ показать не может.
 *
 * ## Процент жира по обхватам
 *
 * Метод ВМС США: считает процент жира по обхватам шеи, талии (и бёдер у
 * женщин) с поправкой на рост. Его достоинство — нужна только сантиметровая
 * лента; недостаток — погрешность порядка 3–4 процентных пунктов, а у людей
 * с нетипичным телосложением больше. Для отслеживания динамики этого
 * достаточно, для «точной цифры» — нет, и мы об этом говорим прямо.
 *
 * ## Здоровый диапазон вместо «идеального веса»
 *
 * Формулы Devine, Robinson, Miller и Hamwi дают «идеальный вес» по росту, и
 * все четыре дают разные числа — расхождение до 8 килограммов. Мало того,
 * они расходятся и в направлении: у Miller самая высокая база и самая
 * пологая прибавка, поэтому на низком росте она даёт больше всех, а на
 * высоком — меньше всех. Это лучшее доказательство того, что никакого
 * одного идеального веса не существует. Поэтому мы показываем все четыре
 * сразу как разброс и рядом — диапазон нормального ИМТ, который честнее
 * любой из них.
 *
 * Отдельная оговорка про низкий рост: все четыре считаются от роста сверх
 * 152,4 см, и ниже этой границы прибавка обнуляется — формула перестаёт
 * реагировать на рост вовсе. При росте около 140 см она выдаёт вес выше
 * верхней границы здорового ИМТ. Мы показываем это на самой странице, а не
 * прячем: это и есть причина не доверять «идеальному весу» как числу.
 */

export type BodyFatInput = {
  sex: "female" | "male";
  heightCm: number;
  neckCm: number;
  waistCm: number;
  /** Обхват бёдер — нужен только женщинам. */
  hipCm?: number;
};

export type BodyFatResult = {
  percent: number;
  category: "essential" | "athlete" | "fitness" | "average" | "high";
  /** Масса жира и безжировая масса, если известен вес. */
  fatMassKg?: number;
  leanMassKg?: number;
};

/** Границы категорий, проценты. Разные для мужчин и женщин. */
const CATEGORIES: Record<"female" | "male", Array<{ upTo: number; key: BodyFatResult["category"] }>> = {
  female: [
    { upTo: 14, key: "essential" },
    { upTo: 21, key: "athlete" },
    { upTo: 25, key: "fitness" },
    { upTo: 32, key: "average" },
    { upTo: Infinity, key: "high" },
  ],
  male: [
    { upTo: 6, key: "essential" },
    { upTo: 14, key: "athlete" },
    { upTo: 18, key: "fitness" },
    { upTo: 25, key: "average" },
    { upTo: Infinity, key: "high" },
  ],
};

export const BODY_FAT_LABELS: Record<BodyFatResult["category"], string> = {
  essential: "минимально необходимый",
  athlete: "спортивный",
  fitness: "подтянутый",
  average: "средний",
  high: "выше среднего",
};

/**
 * Формула ВМС США. Логарифмы десятичные; результат зажимаем в разумные
 * границы — при нелепом вводе формула даёт отрицательные проценты.
 */
export function computeBodyFat(input: BodyFatInput, weightKg?: number): BodyFatResult | null {
  const { sex, heightCm, neckCm, waistCm, hipCm } = input;
  if (!(heightCm > 0) || !(neckCm > 0) || !(waistCm > 0)) return null;
  if (sex === "female" && !(hipCm && hipCm > 0)) return null;

  let percent: number;
  if (sex === "male") {
    if (waistCm - neckCm <= 0) return null;
    percent =
      495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    const sum = waistCm + (hipCm ?? 0) - neckCm;
    if (sum <= 0) return null;
    percent =
      495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.221 * Math.log10(heightCm)) - 450;
  }

  if (!Number.isFinite(percent)) return null;
  const clamped = Math.min(65, Math.max(3, Math.round(percent * 10) / 10));
  const category = CATEGORIES[sex].find((row) => clamped <= row.upTo)?.key ?? "high";

  return {
    percent: clamped,
    category,
    ...(weightKg && weightKg > 0
      ? {
          fatMassKg: Math.round(((weightKg * clamped) / 100) * 10) / 10,
          leanMassKg: Math.round((weightKg - (weightKg * clamped) / 100) * 10) / 10,
        }
      : {}),
  };
}

export type IdealFormula = { name: string; note: string; weightKg: number };

/**
 * Четыре классические формулы «идеального веса». Считаются от роста сверх
 * 152,4 см (5 футов) — наследие имперской системы, из-за которого на
 * невысоком росте они начинают давать заниженные значения.
 */
export function idealWeights(sex: "female" | "male", heightCm: number): IdealFormula[] {
  const overFive = Math.max(0, heightCm - 152.4) / 2.54; // дюймов сверх 5 футов
  const rows: Array<[string, number, number, string]> = [
    ["Devine (1974)", sex === "male" ? 50 : 45.5, 2.3, "Появилась для расчёта доз лекарств, а не для оценки внешности"],
    ["Robinson (1983)", sex === "male" ? 52 : 49, sex === "male" ? 1.9 : 1.7, "Уточнение Devine по данным страховых таблиц"],
    ["Miller (1983)", sex === "male" ? 56.2 : 53.1, sex === "male" ? 1.41 : 1.36, "Слабее прочих реагирует на рост: на низком даёт больше всех, на высоком — меньше всех"],
    ["Hamwi (1964)", sex === "male" ? 48 : 45.5, sex === "male" ? 2.7 : 2.2, "Самая старая; используется в клинической практике США"],
  ];
  return rows.map(([name, base, perInch, note]) => ({
    name,
    note,
    weightKg: Math.round((base + perInch * overFive) * 10) / 10,
  }));
}

export type HealthyWeightRange = {
  /** Диапазон нормального ИМТ, кг. */
  bmiRange: { from: number; to: number };
  /** Разброс четырёх формул «идеального веса», кг. */
  formulaRange: { from: number; to: number };
  formulas: IdealFormula[];
  /** Насколько формулы расходятся между собой, кг. */
  formulaSpread: number;
};

export function healthyWeight(sex: "female" | "male", heightCm: number): HealthyWeightRange | null {
  if (!(heightCm > 0)) return null;
  const meters = heightCm / 100;
  const formulas = idealWeights(sex, heightCm);
  const values = formulas.map((f) => f.weightKg);
  const from = Math.min(...values);
  const to = Math.max(...values);

  return {
    bmiRange: {
      from: Math.round(18.5 * meters * meters),
      to: Math.round(24.9 * meters * meters),
    },
    formulaRange: { from, to },
    formulas,
    formulaSpread: Math.round((to - from) * 10) / 10,
  };
}
