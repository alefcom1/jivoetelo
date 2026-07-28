// LLM, разбирающая фото/описание еды, регулярно выдаёт арифметически
// несогласованные КБЖУ: заявленная калорийность не бьётся с макронутриентами,
// клетчатка превышает углеводы, а сумма макросов — сами 100 г продукта.
// Модуль детерминированно проверяет физическое правдоподобие и поправляет
// то, что не может быть правдой, вместо того чтобы доверять цифрам модели вслепую.

/** То, что хранится в дневнике: спирт отдельно не сохраняем, он уже учтён в kcal. */
export type Per100g = { kcal: number; protein: number; fat: number; carbs: number; fiber: number };

/**
 * Вход проверки. Спирт нужен только чтобы правильно посчитать энергию:
 * без него водка и вино выглядят как «почти ноль калорий» и проверка
 * послушно затирает верную цифру модели.
 */
export type Per100gInput = Per100g & { alcohol?: number };

export type SanityResult = { per100g: Per100g; adjusted: boolean; reasons: string[] };

/**
 * Коэффициенты Атуотера, ккал на грамм.
 *
 * Клетчатка считается по 2, а не по 4: она входит в углеводы, но усваивается
 * лишь частично. Без этой поправки отруби и псиллиум выглядят «недосчитанными»
 * и проверка завышала бы им калорийность на треть.
 */
const KCAL_PER_GRAM = { protein: 4, carbs: 4, fiber: 2, fat: 9, alcohol: 7 };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Энергия из макронутриентов по Атуотеру: 4/9/4 плюс 2 для клетчатки и 7 для спирта. */
export function atwaterKcal(input: Omit<Per100gInput, "kcal">): number {
  const fiber = Math.min(input.fiber, input.carbs);
  const digestibleCarbs = input.carbs - fiber;
  return (
    KCAL_PER_GRAM.protein * input.protein +
    KCAL_PER_GRAM.fat * input.fat +
    KCAL_PER_GRAM.carbs * digestibleCarbs +
    KCAL_PER_GRAM.fiber * fiber +
    KCAL_PER_GRAM.alcohol * (input.alcohol ?? 0)
  );
}

/**
 * Приводит КБЖУ на 100 г к физически правдоподобному виду.
 * Не мутирует входной объект — все проверки идут над локальными копиями.
 *
 * Известное ограничение: продукты на сахарозаменителях-полиолах (эритрит,
 * мальтит) честно содержат углеводы, но почти не дают энергии. Формула
 * Атуотера этого не знает и завысит им калорийность. Такие позиции получают
 * пониженную уверенность, и пользователь видит, что цифру стоит проверить.
 */
export function reconcilePer100g(input: Per100gInput): SanityResult {
  const reasons: string[] = [];
  let protein = input.protein;
  let fat = input.fat;
  let carbs = input.carbs;
  let fiber = input.fiber;
  let kcal = input.kcal;
  let alcohol = input.alcohol ?? 0;

  // a) клетчатка — часть углеводов и не может их превышать
  if (fiber > carbs) {
    fiber = carbs;
    reasons.push("fiber_above_carbs");
  }

  // b) в 100 г продукта не бывает больше 100 г макронутриентов и спирта
  const macroSum = protein + fat + carbs + alcohol;
  if (macroSum > 100) {
    const factor = 100 / macroSum;
    protein *= factor;
    fat *= factor;
    carbs *= factor;
    alcohol *= factor;
    reasons.push("macros_over_100g");
    // углеводы после масштабирования могли стать меньше клетчатки — ограничиваем снова
    if (fiber > carbs) {
      fiber = carbs;
    }
  }

  // c) заявленная калорийность должна биться с макросами по Атуотеру.
  // Допуск — большее из 15% и 20 ккал: для низкокалорийной еды (огурец, чай)
  // 15% — это единицы ккал, а округление модели легко даёт погрешность больше
  const atwater = atwaterKcal({ protein, fat, carbs, fiber, alcohol });
  const tolerance = Math.max(0.15 * atwater, 20);
  if (Math.abs(kcal - atwater) > tolerance) {
    kcal = atwater;
    reasons.push("kcal_mismatch");
  }

  const per100g: Per100g = {
    kcal: round1(clamp(kcal, 0, 900)),
    protein: round1(clamp(protein, 0, 100)),
    fat: round1(clamp(fat, 0, 100)),
    carbs: round1(clamp(carbs, 0, 100)),
    fiber: round1(clamp(fiber, 0, 50)),
  };

  return { per100g, adjusted: reasons.length > 0, reasons };
}
