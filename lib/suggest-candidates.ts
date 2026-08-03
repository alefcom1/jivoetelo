// Кандидаты для «что съесть сейчас» — из наших данных, а не из головы модели.
//
// До сих пор блюда придумывала модель: остаток дня уходил ей строкой, а
// обратно приходили названия с числами, которые она же и назначила. Проверки,
// что предложенное укладывается в остаток, не было (см. docs/suggestions.md).
//
// Здесь отбор становится нашим. Модели остаётся то, что она делает хорошо, —
// формулировка «почему именно это сейчас»; числа перестают быть выдуманными,
// подбор начинает работать при выключенном разборе и не тратит на себя квоту.
//
// ── Откуда берутся варианты ────────────────────────────────────────────────
//
// Три источника, и все уже лежат в репозитории:
//
// 1. **Готовые блюда** (`lib/dishes.ts`) — настоящая еда с посчитанными по
//    рецептурам диапазонами. Берём середину диапазона: это подсказка, а не
//    запись в дневник, и диапазон здесь только запутает.
// 2. **Пары «белковое + гарнир или овощи»** из справочника. Одна гречка —
//    не ужин, а гречка с курицей — ужин. Пар получается несколько сотен, и
//    это ровно тот размер, который перебирается мгновенно.
// 3. **Одиночные продукты, которые едят сами по себе** — фрукт, творог,
//    орехи. Для перекуса пара избыточна.
//
// Чего здесь намеренно нет: комбинаторики глубже двух слотов. «Курица + рис +
// брокколи + масло» — это уже рецепт, а рецепты мы не сочиняем (см.
// docs/product-catalog.md, раздел про рецепты).

import { DISHES, type Dish } from "./dishes.ts";
import { FOOD_REFERENCE, type ReferenceFood } from "./food-reference.ts";
import { scoreCandidate, type DayGap, type Portion } from "./day-gap.ts";

export type Candidate = {
  title: string;
  portion: Portion;
  /** Что легло в основу — для дедупликации: два творога подряд не подсказка. */
  baseNames: string[];
};

/** Питательная ценность порции продукта: состав дан на 100 г. */
function portionOf(food: ReferenceFood, grams = food.portionG): Portion {
  const k = grams / 100;
  return {
    kcal: food.kcal * k,
    protein: food.protein * k,
    fat: food.fat * k,
    carbs: food.carbs * k,
    fiber: food.fiber * k,
  };
}

function middle([from, to]: [number, number]): number {
  return (from + to) / 2;
}

/**
 * Блюдо каталога. Клетчатки у блюд нет в данных вовсе, и подставлять сюда
 * ноль честнее, чем догадку: подбор просто не будет засчитывать блюду
 * закрытие клетчатки, а не станет обещать несуществующее.
 */
function dishCandidate(dish: Dish): Candidate {
  const k = dish.portionG / 100;
  return {
    title: dish.name,
    portion: {
      kcal: middle(dish.kcal) * k,
      protein: middle(dish.protein) * k,
      fat: middle(dish.fat) * k,
      carbs: middle(dish.carbs) * k,
      fiber: 0,
    },
    baseNames: [dish.name],
  };
}

/** Белковая основа: то, вокруг чего собирается приём пищи. */
const PROTEIN_BASE = new Set([
  "Куриная грудка отварная", "Куриное бедро без кожи", "Филе индейки",
  "Говядина отварная", "Лосось запечённый", "Треска отварная", "Скумбрия",
  "Тунец в собственном соку", "Креветки отварные", "Яйцо куриное",
  "Творог 5%", "Творог обезжиренный", "Йогурт греческий 2%", "Тофу",
  "Фасоль отварная", "Нут отварной", "Чечевица отварная",
]);

/** Гарниры и овощи: то, чем основу дополняют. */
const SIDE = new Set([
  "Гречка отварная", "Рис бурый отварной", "Рис белый отварной",
  "Булгур отварной", "Киноа отварная", "Перловка отварная", "Картофель отварной",
  "Брокколи", "Капуста белокочанная", "Морковь", "Перец болгарский",
  "Кабачок", "Салат листовой", "Огурец", "Помидор",
]);

/** Едят сами по себе — для перекуса пара избыточна. */
const SOLO = new Set([
  "Яблоко", "Банан", "Апельсин", "Груша", "Черника", "Клубника",
  "Творог 5%", "Творог обезжиренный", "Йогурт греческий 2%", "Кефир 1%",
  "Миндаль", "Грецкий орех", "Хлебцы цельнозерновые",
]);

/**
 * Все кандидаты. Список не зависит от человека и мог бы считаться один раз,
 * но он маленький, а лишний модульный кеш — лишний источник несогласованности
 * при правке справочника.
 */
export function buildCandidates(): Candidate[] {
  const byName = new Map(FOOD_REFERENCE.map((food) => [food.name, food]));
  const candidates: Candidate[] = DISHES.map(dishCandidate);

  for (const name of SOLO) {
    const food = byName.get(name);
    if (food) candidates.push({ title: name, portion: portionOf(food), baseNames: [name] });
  }

  for (const baseName of PROTEIN_BASE) {
    const base = byName.get(baseName);
    if (!base) continue;
    for (const sideName of SIDE) {
      const side = byName.get(sideName);
      if (!side) continue;
      const b = portionOf(base);
      const s = portionOf(side);
      candidates.push({
        // Названия в именительном: склонять пары правилом нельзя, а ошибка в
        // подсказке видна ровно так же, как в заголовке страницы.
        title: `${baseName} и ${sideName.toLowerCase()}`,
        portion: {
          kcal: b.kcal + s.kcal,
          protein: b.protein + s.protein,
          fat: b.fat + s.fat,
          carbs: b.carbs + s.carbs,
          fiber: b.fiber + s.fiber,
        },
        baseNames: [baseName, sideName],
      });
    }
  }

  return candidates;
}

/** Нормализация для сравнения с тем, что уже съедено. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

import type { CandidateScore } from "./day-gap.ts";

/** Кандидат вместе со своей оценкой — `explain` ждёт именно её целиком. */
export type PickedCandidate = Candidate & CandidateScore;

/**
 * Лучшие варианты под остаток дня.
 *
 * `exclude` — то, что человек уже ел сегодня: предлагать это снова незачем.
 * Сравнение по вхождению основы в строку, а не по равенству: в дневнике
 * лежит «Творог 5% с ягодами», а основа называется «Творог 5%».
 *
 * Дедупликация по **всем** составляющим, а не по названию и не по первой из
 * них. Проверять только основу мало: тогда вместо «курица с гречкой, курица с
 * рисом» получается зеркальное «курица с булгуром, индейка с булгуром,
 * чечевица с булгуром» — три разных белка при одном и том же гарнире.
 * Это видно на живом прогоне сразу, а тестом на одну основу не ловится.
 */
export function pickCandidates(
  gap: DayGap,
  options: { exclude?: string[]; limit?: number; offset?: number } = {},
): PickedCandidate[] {
  const exclude = (options.exclude ?? []).map(normalize);
  const limit = options.limit ?? 3;

  const scored = buildCandidates()
    .filter((candidate) => !candidate.baseNames.some((name) => {
      const needle = normalize(name);
      return exclude.some((eaten) => eaten.includes(needle) || needle.includes(eaten));
    }))
    .map((candidate) => ({ ...candidate, ...scoreCandidate(gap, candidate.portion) }))
    .sort((a, b) => b.score - a.score);

  // Смещение — для кнопки «Показать другие»: следующая тройка, а не та же
  // самая. Берём с шагом, а не подряд, чтобы вторая тройка не оказалась
  // соседями первой по одному и тому же основанию.
  const offset = Math.max(0, options.offset ?? 0);
  const picked: PickedCandidate[] = [];
  const usedBases = new Set<string>();
  let skipped = 0;

  for (const candidate of scored) {
    const parts = candidate.baseNames.map(normalize);
    if (parts.some((part) => usedBases.has(part))) continue;
    for (const part of parts) usedBases.add(part);
    if (skipped < offset) {
      skipped++;
      continue;
    }
    picked.push(candidate);
    if (picked.length >= limit) break;
  }

  return picked;
}
