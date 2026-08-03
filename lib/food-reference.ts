// Справочник продуктов на 100 г — чтобы позицию в дневник можно было
// положить руками, без обращения к AI.
//
// Зачем он нужен. До сих пор еда попадала в дневник единственным путём —
// через разбор. Если разбор выключен (`AI_PROVIDER=off`, уведомление РКН,
// сбой прокси) или кончился дневной потолок расходов, наполнить дневник
// было нечем вообще. Просить человека ввести пять чисел на 100 г — не
// решение: своих КБЖУ он не знает, и это ровно та работа, ради избавления
// от которой люди и ставят такие приложения.
//
// Чем он не является. Это не база продуктов и не замена разбора: здесь
// основа рациона, а не всё съедобное. Незнакомое по-прежнему уходит в
// разбор, а если и он недоступен — остаётся ручной ввод чисел.
//
// Откуда числа: типовые значения продовольственных таблиц. Крупы и макароны
// даны **в отварном виде** — на весах у человека готовая еда, а не сухая
// крупа, и путаница здесь стоит трёхкратной ошибки. Тест
// `tests/food-reference.test.mjs` сверяет калорийность с белками, жирами и
// углеводами по Атуотеру: опечатка в разряде так не проходит.

export type ReferenceFood = {
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  /** Типичная порция, г — подставляется в поле веса, чтобы не считать в уме. */
  portionG: number;
};

export const FOOD_REFERENCE: ReferenceFood[] = [
  // Птица и мясо
  { name: "Куриная грудка отварная", kcal: 165, protein: 31, fat: 3.6, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Куриное бедро без кожи", kcal: 209, protein: 26, fat: 11, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Филе индейки", kcal: 189, protein: 29, fat: 7, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Говядина отварная", kcal: 254, protein: 25.8, fat: 16.8, carbs: 0, fiber: 0, portionG: 120 },
  { name: "Свинина запечённая", kcal: 270, protein: 27, fat: 18, carbs: 0, fiber: 0, portionG: 120 },
  { name: "Фарш говяжий", kcal: 254, protein: 17, fat: 20, carbs: 0, fiber: 0, portionG: 120 },
  { name: "Колбаса варёная", kcal: 257, protein: 12.8, fat: 22.2, carbs: 1.5, fiber: 0, portionG: 50 },
  { name: "Сосиски молочные", kcal: 266, protein: 11, fat: 24, carbs: 1.6, fiber: 0, portionG: 100 },
  { name: "Бекон", kcal: 500, protein: 37, fat: 40, carbs: 0, fiber: 0, portionG: 30 },

  // Рыба и морепродукты
  { name: "Лосось запечённый", kcal: 208, protein: 20, fat: 13, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Треска отварная", kcal: 82, protein: 18, fat: 0.7, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Скумбрия", kcal: 191, protein: 18, fat: 13.2, carbs: 0, fiber: 0, portionG: 120 },
  { name: "Сельдь солёная", kcal: 217, protein: 19, fat: 15, carbs: 0, fiber: 0, portionG: 80 },
  { name: "Тунец в собственном соку", kcal: 96, protein: 22, fat: 1, carbs: 0, fiber: 0, portionG: 100 },
  { name: "Креветки отварные", kcal: 99, protein: 24, fat: 0.3, carbs: 0.2, fiber: 0, portionG: 120 },

  // Яйца
  { name: "Яйцо куриное", kcal: 157, protein: 12.7, fat: 11.5, carbs: 0.7, fiber: 0, portionG: 55 },
  { name: "Яичный белок", kcal: 52, protein: 11, fat: 0, carbs: 0, fiber: 0, portionG: 33 },

  // Молочное
  { name: "Творог 5%", kcal: 121, protein: 17.2, fat: 5, carbs: 1.8, fiber: 0, portionG: 150 },
  { name: "Творог обезжиренный", kcal: 71, protein: 16.5, fat: 0.6, carbs: 1.3, fiber: 0, portionG: 150 },
  { name: "Йогурт греческий 2%", kcal: 66, protein: 9, fat: 2, carbs: 3.6, fiber: 0, portionG: 150 },
  { name: "Кефир 1%", kcal: 40, protein: 2.8, fat: 1, carbs: 4, fiber: 0, portionG: 250 },
  { name: "Молоко 2,5%", kcal: 52, protein: 2.9, fat: 2.5, carbs: 4.8, fiber: 0, portionG: 200 },
  { name: "Сметана 15%", kcal: 158, protein: 2.6, fat: 15, carbs: 3, fiber: 0, portionG: 30 },
  { name: "Сыр российский", kcal: 364, protein: 23, fat: 29, carbs: 0.3, fiber: 0, portionG: 30 },
  { name: "Моцарелла", kcal: 280, protein: 22, fat: 21, carbs: 2.2, fiber: 0, portionG: 50 },
  { name: "Масло сливочное 82%", kcal: 748, protein: 0.5, fat: 82.5, carbs: 0.8, fiber: 0, portionG: 10 },

  // Крупы, макароны — всё в отварном виде
  { name: "Гречка отварная", kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3, fiber: 2.7, portionG: 180 },
  { name: "Рис белый отварной", kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, fiber: 0.4, portionG: 180 },
  { name: "Рис бурый отварной", kcal: 111, protein: 2.6, fat: 0.9, carbs: 23, fiber: 1.8, portionG: 180 },
  { name: "Овсянка на воде", kcal: 88, protein: 3, fat: 1.7, carbs: 15, fiber: 1.7, portionG: 250 },
  { name: "Макароны отварные", kcal: 131, protein: 5, fat: 1.1, carbs: 25, fiber: 1.2, portionG: 200 },
  { name: "Булгур отварной", kcal: 83, protein: 3.1, fat: 0.2, carbs: 18.6, fiber: 4.5, portionG: 180 },
  { name: "Киноа отварная", kcal: 120, protein: 4.4, fat: 1.9, carbs: 21.3, fiber: 2.8, portionG: 180 },
  { name: "Перловка отварная", kcal: 106, protein: 2.3, fat: 0.4, carbs: 22.2, fiber: 2.5, portionG: 180 },

  // Хлеб
  { name: "Хлеб ржаной", kcal: 210, protein: 6.6, fat: 1.2, carbs: 41, fiber: 5.8, portionG: 35 },
  { name: "Хлеб белый", kcal: 265, protein: 8, fat: 3.2, carbs: 49, fiber: 2.5, portionG: 35 },
  { name: "Хлебцы цельнозерновые", kcal: 310, protein: 10, fat: 3, carbs: 57, fiber: 8, portionG: 20 },

  // Овощи и картофель
  { name: "Огурец", kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.8, fiber: 0.9, portionG: 100 },
  { name: "Помидор", kcal: 18, protein: 0.9, fat: 0.2, carbs: 3.9, fiber: 1.2, portionG: 100 },
  { name: "Капуста белокочанная", kcal: 25, protein: 1.3, fat: 0.1, carbs: 5.8, fiber: 2.5, portionG: 150 },
  { name: "Брокколи", kcal: 34, protein: 2.8, fat: 0.4, carbs: 6.6, fiber: 2.6, portionG: 150 },
  { name: "Морковь", kcal: 41, protein: 0.9, fat: 0.2, carbs: 9.6, fiber: 2.8, portionG: 100 },
  { name: "Перец болгарский", kcal: 27, protein: 1, fat: 0.2, carbs: 6.3, fiber: 2.1, portionG: 100 },
  { name: "Кабачок", kcal: 24, protein: 0.6, fat: 0.3, carbs: 4.6, fiber: 1, portionG: 150 },
  { name: "Лук репчатый", kcal: 41, protein: 1.4, fat: 0.1, carbs: 8.2, fiber: 1.7, portionG: 50 },
  { name: "Салат листовой", kcal: 15, protein: 1.4, fat: 0.2, carbs: 2.9, fiber: 1.3, portionG: 80 },
  { name: "Авокадо", kcal: 160, protein: 2, fat: 14.7, carbs: 8.5, fiber: 6.7, portionG: 100 },
  { name: "Картофель отварной", kcal: 82, protein: 2, fat: 0.4, carbs: 16.7, fiber: 1.4, portionG: 200 },
  { name: "Картофель фри", kcal: 312, protein: 3.4, fat: 15, carbs: 41, fiber: 3.8, portionG: 130 },

  // Фрукты и ягоды
  { name: "Яблоко", kcal: 52, protein: 0.4, fat: 0.4, carbs: 13.8, fiber: 2.4, portionG: 180 },
  { name: "Банан", kcal: 89, protein: 1.1, fat: 0.3, carbs: 22.8, fiber: 2.6, portionG: 120 },
  { name: "Апельсин", kcal: 47, protein: 0.9, fat: 0.2, carbs: 11.8, fiber: 2.4, portionG: 180 },
  { name: "Груша", kcal: 57, protein: 0.4, fat: 0.1, carbs: 15, fiber: 3.1, portionG: 170 },
  { name: "Виноград", kcal: 69, protein: 0.7, fat: 0.2, carbs: 18.1, fiber: 0.9, portionG: 120 },
  { name: "Черника", kcal: 57, protein: 0.7, fat: 0.3, carbs: 14.5, fiber: 2.4, portionG: 100 },
  { name: "Клубника", kcal: 32, protein: 0.7, fat: 0.3, carbs: 7.7, fiber: 2, portionG: 150 },

  // Орехи и бобовые
  { name: "Миндаль", kcal: 579, protein: 21, fat: 50, carbs: 22, fiber: 12.5, portionG: 30 },
  { name: "Грецкий орех", kcal: 654, protein: 15, fat: 65, carbs: 14, fiber: 6.7, portionG: 30 },
  { name: "Арахисовая паста", kcal: 588, protein: 25, fat: 50, carbs: 20, fiber: 6, portionG: 20 },
  { name: "Фасоль отварная", kcal: 123, protein: 7.8, fat: 0.5, carbs: 21.5, fiber: 6.4, portionG: 150 },
  { name: "Нут отварной", kcal: 164, protein: 8.9, fat: 2.6, carbs: 27.4, fiber: 7.6, portionG: 150 },
  { name: "Чечевица отварная", kcal: 116, protein: 9, fat: 0.4, carbs: 20, fiber: 7.9, portionG: 150 },
  { name: "Тофу", kcal: 76, protein: 8, fat: 4.8, carbs: 1.9, fiber: 0.3, portionG: 100 },

  // Масла и соусы
  { name: "Масло оливковое", kcal: 884, protein: 0, fat: 100, carbs: 0, fiber: 0, portionG: 10 },
  { name: "Майонез", kcal: 680, protein: 1, fat: 75, carbs: 2.6, fiber: 0, portionG: 15 },
  { name: "Кетчуп", kcal: 112, protein: 1.7, fat: 0.2, carbs: 26, fiber: 0.3, portionG: 20 },

  // Сладкое.
  //
  // Десерты здесь не для полноты списка. Справочник — это то, чем человек
  // наполняет дневник руками, и если в нём есть сахар с шоколадом, но нет
  // мороженого и печенья, он молча сообщает, что одно записывать положено, а
  // другое нет. Для сервиса, который обещает «без запретов и давления», это
  // осуждение через умолчание: съесть мороженое можно, а записать — нечем.
  { name: "Шоколад молочный", kcal: 535, protein: 7.6, fat: 30, carbs: 59, fiber: 3.4, portionG: 25 },
  { name: "Мороженое пломбир", kcal: 227, protein: 3.5, fat: 15, carbs: 20.5, fiber: 0, portionG: 100 },
  { name: "Мороженое молочное", kcal: 126, protein: 3.2, fat: 3.5, carbs: 21.3, fiber: 0, portionG: 100 },
  { name: "Печенье овсяное", kcal: 437, protein: 6.5, fat: 14.5, carbs: 71, fiber: 3, portionG: 40 },
  { name: "Зефир", kcal: 326, protein: 0.8, fat: 0.1, carbs: 79.8, fiber: 0, portionG: 33 },
  { name: "Мёд", kcal: 304, protein: 0.3, fat: 0, carbs: 82, fiber: 0.2, portionG: 20 },
  { name: "Сахар", kcal: 387, protein: 0, fat: 0, carbs: 100, fiber: 0, portionG: 8 },

  // Напитки
  { name: "Кофе чёрный без сахара", kcal: 2, protein: 0.1, fat: 0, carbs: 0, fiber: 0, portionG: 200 },
  { name: "Чай без сахара", kcal: 1, protein: 0, fat: 0, carbs: 0.2, fiber: 0, portionG: 200 },
  { name: "Сок апельсиновый", kcal: 45, protein: 0.7, fat: 0.2, carbs: 10.4, fiber: 0.2, portionG: 200 },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

/**
 * Поиск по справочнику. Совпадение по подстроке, но вперёд выходит то, что
 * начинается с запроса: по «мол» сначала «Молоко», а потом «Шоколад
 * молочный». При равенстве — что короче: короткое название почти всегда и
 * есть основной продукт.
 */
export function searchFoodReference(query: string, limit = 8): ReferenceFood[] {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  return FOOD_REFERENCE
    .map((food) => ({ food, at: normalize(food.name).indexOf(needle) }))
    .filter((row) => row.at >= 0)
    .sort((a, b) => a.at - b.at || a.food.name.length - b.food.name.length)
    .slice(0, limit)
    .map((row) => row.food);
}

/**
 * Число из поля ввода КБЖУ: запятая как разделитель (на телефоне цифровая
 * клавиатура даёт её, а не точку), пустое поле и мусор — ноль.
 *
 * Верхняя граница обрезает, а не отвергает: человек списывает числа с
 * упаковки, и промах на разряд («170» белка вместо «17») не должен ни ронять
 * форму, ни утекать в базу. Ноль вместо пустого — тоже осознанно: на упаковке
 * прочерк в строке клетчатки значит именно ноль.
 */
export function parseNutrient(value: string, max: number): number {
  const parsed = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(max, parsed);
}
