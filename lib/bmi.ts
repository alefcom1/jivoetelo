/**
 * Индекс массы тела и то, что честнее его: отношение талии к росту.
 *
 * ## Почему здесь два показателя, а не один
 *
 * ИМТ — единственный запрос этой темы, который люди задают массово, и не
 * дать его было бы упрямством. Но сам по себе он отвечает на вопрос «сколько
 * весит ваше тело относительно роста», а не на тот, ради которого его
 * спрашивают, — «насколько это опасно». Он не отличает мышцы от жира и не
 * знает, где этот жир лежит, хотя именно расположение важнее количества.
 *
 * Поэтому рядом считаем **WHtR** — отношение обхвата талии к росту. Порог
 * 0,5 («талия меньше половины роста») в британском руководстве NICE NG246
 * стоит как практический ориентир для взрослых с ИМТ ниже 35, и он
 * улавливает висцеральный жир, который ИМТ пропускает: человек с нормальным
 * ИМТ и талией 100 см при росте 170 по ИМТ «здоров», по WHtR — нет.
 *
 * Обе величины — не диагноз. Они сужают вопрос, с которым идут к врачу.
 */

export type BmiCategory =
  | "underweight_severe"
  | "underweight"
  | "normal"
  | "overweight"
  | "obese_1"
  | "obese_2"
  | "obese_3";

export type BmiResult = {
  bmi: number;
  category: BmiCategory;
  /** Границы нормального ИМТ в килограммах для этого роста. */
  healthyWeight: { from: number; to: number };
};

export type WaistResult = {
  ratio: number;
  zone: "low" | "increased" | "high";
};

export const BMI_LABELS: Record<BmiCategory, string> = {
  underweight_severe: "выраженный дефицит массы",
  underweight: "дефицит массы тела",
  normal: "нормальная масса тела",
  overweight: "избыточная масса тела",
  obese_1: "ожирение I степени",
  obese_2: "ожирение II степени",
  obese_3: "ожирение III степени",
};

/** Границы ВОЗ. 16 и ниже — выраженный дефицит; дальше стандартная шкала. */
export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 16) return "underweight_severe";
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  if (bmi < 35) return "obese_1";
  if (bmi < 40) return "obese_2";
  return "obese_3";
}

export function computeBmi(weightKg: number, heightCm: number): BmiResult | null {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const meters = heightCm / 100;
  const bmi = weightKg / (meters * meters);
  if (!Number.isFinite(bmi)) return null;

  return {
    bmi: Math.round(bmi * 10) / 10,
    category: bmiCategory(bmi),
    // Диапазон здорового веса полезнее самого индекса: он отвечает на
    // вопрос «а сколько тогда», не заставляя решать уравнение обратно.
    healthyWeight: {
      from: Math.round(18.5 * meters * meters),
      to: Math.round(24.9 * meters * meters),
    },
  };
}

/**
 * Отношение талии к росту. Пороги — из NICE NG246: до 0,5 риск не повышен,
 * 0,5–0,59 повышен, 0,6 и выше высокий.
 */
export function computeWaistRatio(waistCm: number, heightCm: number): WaistResult | null {
  if (!(waistCm > 0) || !(heightCm > 0)) return null;
  const ratio = waistCm / heightCm;
  if (!Number.isFinite(ratio)) return null;
  return {
    ratio: Math.round(ratio * 100) / 100,
    zone: ratio < 0.5 ? "low" : ratio < 0.6 ? "increased" : "high",
  };
}

/** Талия, при которой отношение к росту становится равным 0,5. */
export function waistTargetCm(heightCm: number): number {
  return Math.round(heightCm * 0.5);
}

export const WAIST_LABELS: Record<WaistResult["zone"], string> = {
  low: "риск не повышен",
  increased: "риск повышен",
  high: "риск высокий",
};

/**
 * Кому расчёт не подходит и почему. Возвращаем не «ошибку», а честное
 * предупреждение рядом с числом: скрывать результат бессмысленно, человек
 * найдёт его на соседнем сайте без всяких оговорок.
 */
export function bmiCaveats(input: { age?: number; pregnant?: boolean; athlete?: boolean }): string[] {
  const out: string[] = [];
  if (input.age !== undefined && input.age < 18) {
    out.push(
      "До 18 лет взрослая шкала ИМТ не применяется: у детей и подростков используют перцентильные таблицы по возрасту и полу. Обсудите вес с педиатром, а не с калькулятором.",
    );
  }
  if (input.age !== undefined && input.age >= 65) {
    out.push(
      "После 65 лет небольшой избыток массы по шкале ИМТ не связан с повышенным риском, а недостаток — связан. Нижнюю границу нормы в этом возрасте обычно поднимают.",
    );
  }
  if (input.pregnant) {
    out.push("При беременности ИМТ не интерпретируется по обычной шкале — прибавку веса ведёт врач.");
  }
  if (input.athlete) {
    out.push(
      "При заметной мышечной массе ИМТ завышает риск: мышцы тяжелее жира, а формула их не различает. Отношение талии к росту в этом случае информативнее.",
    );
  }
  return out;
}
