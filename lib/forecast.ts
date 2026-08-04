/**
 * Прогноз веса: что будет, если так и есть.
 *
 * ## Чем отличается от /raschet/temp
 *
 * Там вход — желаемый темп («хочу минус полкило в неделю»), выход — нужный
 * дефицит. Здесь вход обратный и более частый: «я ем примерно столько-то,
 * что со мной будет». Это разные вопросы, и склеивать их в одну страницу
 * значит отвечать невпопад на оба.
 *
 * ## Почему прогноз нелинейный
 *
 * Наивная формула «7700 ккал = 1 кг жира» даёт бесконечное снижение: минус
 * 500 ккал в день — минус 26 кг за год, минус 52 за два. В жизни этого не
 * происходит, и дело не в силе воли: с падением массы падает и расход. Тело
 * легче на 10 кг тратит примерно на 100–150 ккал в сутки меньше — дефицит
 * сам собой сжимается, пока не станет нулём.
 *
 * Поэтому считаем помесячно: каждый месяц пересчитываем расход под новый
 * вес и берём дефицит уже от него. Кривая выходит затухающая — та самая,
 * из-за которой «встал вес» на четвёртом месяце воспринимают как провал,
 * хотя это обычная арифметика.
 *
 * Коэффициент 7700 ккал на килограмм — упрощение (реальная ткань не чистый
 * жир), но для горизонта в несколько месяцев ошибка меньше, чем разброс
 * самих оценок расхода. Об этом сказано на странице прямо.
 */

/** Килокалорий в килограмме массы тела при снижении. */
export const KCAL_PER_KG = 7700;

export type ForecastPoint = {
  /** Номер месяца от старта: 0 — сейчас. */
  month: number;
  weightKg: number;
  /** Расход при этом весе, ккал/сут. */
  tdeeKcal: number;
  /** Фактический дефицит в этот месяц, ккал/сут. */
  deficitKcal: number;
};

export type ForecastResult = {
  points: ForecastPoint[];
  /** Вес в конце горизонта. */
  finalWeightKg: number;
  /** Всего изменение, кг (отрицательное — снижение). */
  totalChangeKg: number;
  /** Месяц, на котором изменение за месяц падает ниже 0,5 кг, или null. */
  plateauMonth: number | null;
  /** Вес, на котором расход сравняется с рационом. */
  equilibriumKg: number;
};

/**
 * Расход при заданном весе. Считаем производную от Миффлина по массе: у
 * взрослых это ~10 ккал на килограмм в формуле покоя, что после множителя
 * активности даёт 13–17. Берём коэффициент активности как отношение
 * стартового расхода к стартовому весу, чтобы прогноз согласовался с тем
 * расходом, который человек уже посчитал в другом калькуляторе.
 */
function tdeeAtWeight(startWeight: number, startTdee: number, weight: number): number {
  const perKg = 10 * (startTdee / (startWeight * 10 + 500));
  return Math.max(1000, Math.round(startTdee + (weight - startWeight) * perKg * 1.35));
}

export function forecastWeight(input: {
  startWeightKg: number;
  startTdeeKcal: number;
  /** Сколько человек ест в сутки, ккал. */
  intakeKcal: number;
  /** Горизонт прогноза, месяцев. */
  months: number;
}): ForecastResult {
  const months = Math.max(1, Math.min(24, Math.round(input.months)));
  const points: ForecastPoint[] = [];
  let weight = input.startWeightKg;

  for (let month = 0; month <= months; month++) {
    const tdee = tdeeAtWeight(input.startWeightKg, input.startTdeeKcal, weight);
    const deficit = tdee - input.intakeKcal;
    points.push({
      month,
      weightKg: Math.round(weight * 10) / 10,
      tdeeKcal: tdee,
      deficitKcal: Math.round(deficit),
    });
    if (month === months) break;
    // 30,4 дня — средний месяц: считать по 30 значит терять неделю за год.
    weight -= (deficit * 30.4) / KCAL_PER_KG;
    weight = Math.max(30, weight);
  }

  let plateau: number | null = null;
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].weightKg - points[i - 1].weightKg) < 0.5) {
      plateau = points[i].month;
      break;
    }
  }

  // Равновесный вес: тот, при котором расход равен рациону.
  let equilibrium = input.startWeightKg;
  for (let i = 0; i < 400; i++) {
    const tdee = tdeeAtWeight(input.startWeightKg, input.startTdeeKcal, equilibrium);
    const gap = tdee - input.intakeKcal;
    if (Math.abs(gap) < 5) break;
    equilibrium -= gap / 200;
    if (equilibrium < 35 || equilibrium > 300) break;
  }

  const final = points[points.length - 1].weightKg;
  return {
    points,
    finalWeightKg: final,
    totalChangeKg: Math.round((final - input.startWeightKg) * 10) / 10,
    plateauMonth: plateau,
    equilibriumKg: Math.round(Math.min(300, Math.max(35, equilibrium)) * 10) / 10,
  };
}
