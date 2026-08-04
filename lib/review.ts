// Недельный обзор (раздел 8.12 спецификации): редакционный формат,
// поддерживающий язык, тренд вместо шума. Текст детерминированный —
// собирается из посчитанной статистики без обращения к модели.

import { describePeriod, type PeriodStats } from "./meal-stats.ts";
import { pluralRu, type PluralForms } from "./plural.ts";
import type { Targets } from "./targets.ts";
import { formatKgChange } from "./trend.ts";

/** «1 дня», «2 дней», «5 дней» — форма после «из N». */
const DAY_GENITIVE: PluralForms = ["дня", "дней", "дней"];

export type DayStat = {
  day: string;
  kcal: number;
  protein: number;
  fiber: number;
};

export type WeekReviewInput = {
  dayStats: DayStat[]; // только дни, где есть записи
  /**
   * Длина периода в днях. По умолчанию семь — обзор на экране всегда
   * недельный. Месячному отчёту (lib/report.ts) нужен тот же текст, но про
   * тридцать дней, и разводить два набора формулировок нельзя: они разойдутся
   * при первой же правке, и человек получит на почту не то, что видит в
   * кабинете.
   */
  periodDays?: number;
  /** Как называется горизонт в разделе «Фокус»: «на неделю», «на месяц». */
  focusHorizon?: string;
  weeklyTrendChangeKg: number | null;
  targets: Targets | null;
  showCalories: boolean;
  /**
   * Счётчики приёмов пищи за период (lib/meal-stats.ts). Необязательны: обзор
   * строится и без них. Здесь, а не отдельным блоком на странице, потому что
   * из этого же построителя собираются письма — иначе счётчики пришлось бы
   * держать в двух местах и они бы разошлись.
   */
  mealStats?: PeriodStats | null;
};

export type WeekReview = {
  daysLogged: number;
  avgKcal: number | null;
  avgProtein: number | null;
  avgFiber: number | null;
  sections: Array<{ title: string; text: string }>;
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function buildWeekReview(input: WeekReviewInput): WeekReview {
  const daysLogged = input.dayStats.length;
  const periodDays = input.periodDays ?? 7;
  const horizon = input.focusHorizon ?? "на неделю";
  // «Устойчивый ритм» — это доля периода, а не число дней: пять из семи и
  // пять из тридцати это разные вещи, и хвалить второе за устойчивость
  // значило бы врать.
  const steady = daysLogged >= Math.ceil(periodDays * 5 / 7);
  // «из 31 дня», а не «из 31 дней»: форма согласуется с последней цифрой, и в
  // месяце с 31 днём разница видна сразу.
  const of = `из ${periodDays} ${pluralRu(periodDays, DAY_GENITIVE)}`;
  const avgKcal = avg(input.dayStats.map((d) => d.kcal));
  const avgProtein = avg(input.dayStats.map((d) => d.protein));
  const avgFiber = avg(input.dayStats.map((d) => d.fiber));
  const sections: Array<{ title: string; text: string }> = [];

  // Главный результат
  if (daysLogged === 0) {
    sections.push({
      title: "Главное",
      text: "За этот период записей не было — так бывает, и ничего компенсировать не нужно. Начните с ближайшего приёма пищи: одна запись уже вернёт картину дня.",
    });
    return { daysLogged, avgKcal, avgProtein, avgFiber, sections };
  }
  sections.push({
    title: "Главное",
    text:
      steady
        ? `Вы вели дневник ${daysLogged} ${of} — это устойчивый ритм, на который можно опираться.`
        : `Вы вели дневник ${daysLogged} ${of}. Регулярность важнее полноты: даже одна запись в день сохраняет картину.`,
  });

  // Приёмы пищи — сколько их было и когда. Это факт о ритме, а не о питании,
  // поэтому отдельной секцией и до разбора КБЖУ.
  if (input.mealStats && input.mealStats.mealCount > 0) {
    sections.push({ title: "Приёмы пищи", text: describePeriod(input.mealStats) });
  }

  // Питание
  const nutrition: string[] = [];
  if (input.showCalories && avgKcal !== null && input.targets) {
    if (avgKcal > input.targets.kcalMax) {
      nutrition.push(
        `В записанные дни выходило в среднем ${avgKcal} ккал — больше плана. Это информация, а не оценка: посмотрите, какие приёмы дают основной вклад.`,
      );
    } else if (avgKcal < input.targets.kcalMin) {
      nutrition.push(
        `В записанные дни выходило в среднем ${avgKcal} ккал — ниже плана. Слишком большой дефицит мешает устойчивости: добавьте полноценный перекус.`,
      );
    } else {
      nutrition.push(`В записанные дни выходило в среднем ${avgKcal} ккал — в пределах вашего диапазона.`);
    }
  }
  if (avgProtein !== null && input.targets) {
    nutrition.push(
      avgProtein >= input.targets.proteinTarget * 0.9
        ? `Белка в среднем ${avgProtein} г в день — около цели.`
        : `Белка в среднем ${avgProtein} г в день — ниже цели. Проще всего добрать творогом, яйцами или рыбой.`,
    );
  }
  if (avgFiber !== null && input.targets && avgFiber < input.targets.fiberTarget * 0.7) {
    nutrition.push(`Клетчатки в среднем ${avgFiber} г — меньше, чем хотелось бы. Овощи к обеду — самый лёгкий способ добавить.`);
  }
  if (nutrition.length > 0) sections.push({ title: "Питание", text: nutrition.join(" ") });

  // Тело
  if (input.weeklyTrendChangeKg !== null) {
    const change = input.weeklyTrendChangeKg;
    const formatted = `${formatKgChange(change)} кг`;
    sections.push({
      title: "Тело",
      text:
        Math.abs(change) < 0.15
          ? `Тренд веса за неделю: ${formatted} — практически стабильный. Дневные колебания на этом фоне — просто шум.`
          : `Тренд веса за неделю: ${formatted}. Смотрите именно на тренд — он отражает реальную динамику, а не воду и еду в моменте.`,
    });
  }

  // Фокус на неделю
  const focus =
    avgProtein !== null && input.targets && avgProtein < input.targets.proteinTarget * 0.9
      ? `Один фокус ${horizon}: источник белка в каждый основной приём пищи. Больше ничего менять не нужно.`
      : !steady
        ? `Один фокус ${horizon}: записывать хотя бы один приём пищи в день. Этого достаточно.`
        : `Один фокус ${horizon}: сохранить текущий ритм. Он работает.`;
  sections.push({ title: `Фокус ${horizon}`, text: focus });

  return { daysLogged, avgKcal, avgProtein, avgFiber, sections };
}
