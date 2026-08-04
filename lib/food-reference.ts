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
  /**
   * Спирт, г на 100 г. Есть только у алкоголя и в дневник не сохраняется —
   * там его колонки нет, энергия уже учтена в `kcal`. Нужен единственно
   * затем, чтобы проверка по Атуотеру не объявила пиво ошибкой: без этого
   * слагаемого у него «не сходятся» три четверти калорийности, и справочник
   * пришлось бы оставить без единственного напитка, который люди пьют и
   * записывают.
   */
  alcohol?: number;
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

  // Фрукты и ягоды. Свежие — по съедобной части, без кожуры и косточек.
  { name: "Нектарин", kcal: 44, protein: 1.1, fat: 0.3, carbs: 10.6, fiber: 1.7, portionG: 150 },
  { name: "Персик", kcal: 39, protein: 0.9, fat: 0.3, carbs: 9.5, fiber: 1.5, portionG: 150 },
  { name: "Абрикос", kcal: 48, protein: 1.4, fat: 0.4, carbs: 11.1, fiber: 2, portionG: 100 },
  { name: "Слива", kcal: 46, protein: 0.7, fat: 0.3, carbs: 11.4, fiber: 1.4, portionG: 100 },
  { name: "Мандарин", kcal: 53, protein: 0.8, fat: 0.3, carbs: 13.3, fiber: 1.8, portionG: 100 },
  { name: "Грейпфрут", kcal: 42, protein: 0.8, fat: 0.1, carbs: 10.7, fiber: 1.6, portionG: 200 },
  // Углеводы у лимона занижены относительно западных таблиц намеренно. Там
  // их считают «по разности» — всё, что не белок, не жир, не вода и не зола,
  // — и в эти 9,3 г попадает лимонная кислота, которой в лимоне около 5 г и
  // которая энергии почти не даёт. Отсюда и заявленные 29 ккал вместо 39.
  { name: "Лимон", kcal: 29, protein: 1.1, fat: 0.3, carbs: 5.8, fiber: 2.8, portionG: 30 },
  { name: "Киви", kcal: 61, protein: 1.1, fat: 0.5, carbs: 14.7, fiber: 3, portionG: 100 },
  { name: "Хурма", kcal: 67, protein: 0.6, fat: 0.2, carbs: 18.6, fiber: 3.6, portionG: 150 },
  { name: "Гранат", kcal: 83, protein: 1.7, fat: 1.2, carbs: 18.7, fiber: 4, portionG: 150 },
  { name: "Ананас", kcal: 50, protein: 0.5, fat: 0.1, carbs: 13.1, fiber: 1.4, portionG: 150 },
  { name: "Манго", kcal: 60, protein: 0.8, fat: 0.4, carbs: 15, fiber: 1.6, portionG: 150 },
  { name: "Арбуз", kcal: 30, protein: 0.6, fat: 0.2, carbs: 7.6, fiber: 0.4, portionG: 300 },
  { name: "Дыня", kcal: 34, protein: 0.8, fat: 0.2, carbs: 8.2, fiber: 0.9, portionG: 200 },
  { name: "Вишня", kcal: 50, protein: 1, fat: 0.3, carbs: 12.2, fiber: 1.6, portionG: 100 },
  { name: "Черешня", kcal: 63, protein: 1.1, fat: 0.2, carbs: 16, fiber: 2.1, portionG: 100 },
  { name: "Малина", kcal: 52, protein: 1.2, fat: 0.7, carbs: 11.9, fiber: 6.5, portionG: 100 },
  { name: "Смородина чёрная", kcal: 63, protein: 1.4, fat: 0.4, carbs: 15.4, fiber: 4.8, portionG: 100 },
  { name: "Ежевика", kcal: 43, protein: 1.4, fat: 0.5, carbs: 9.6, fiber: 5.3, portionG: 100 },

  // Сухофрукты — вес маленький, калорийность как у сладкого.
  { name: "Изюм", kcal: 299, protein: 3.1, fat: 0.5, carbs: 79.2, fiber: 3.7, portionG: 40 },
  { name: "Курага", kcal: 241, protein: 3.4, fat: 0.5, carbs: 62.6, fiber: 7.3, portionG: 40 },
  { name: "Чернослив", kcal: 240, protein: 2.2, fat: 0.4, carbs: 63.9, fiber: 7.1, portionG: 40 },
  { name: "Финики", kcal: 277, protein: 1.8, fat: 0.2, carbs: 75, fiber: 6.7, portionG: 40 },

  // Овощи и грибы
  { name: "Свёкла отварная", kcal: 44, protein: 1.7, fat: 0.2, carbs: 10, fiber: 2, portionG: 150 },
  { name: "Тыква запечённая", kcal: 28, protein: 1, fat: 0.1, carbs: 6.5, fiber: 1.1, portionG: 200 },
  { name: "Баклажан", kcal: 25, protein: 1, fat: 0.2, carbs: 5.9, fiber: 3.4, portionG: 150 },
  { name: "Капуста цветная", kcal: 25, protein: 1.9, fat: 0.3, carbs: 5, fiber: 2, portionG: 150 },
  { name: "Капуста квашеная", kcal: 19, protein: 0.9, fat: 0.1, carbs: 4.3, fiber: 2.9, portionG: 150 },
  { name: "Редис", kcal: 16, protein: 0.7, fat: 0.1, carbs: 3.4, fiber: 1.6, portionG: 100 },
  { name: "Чеснок", kcal: 149, protein: 6.4, fat: 0.5, carbs: 33.1, fiber: 2.1, portionG: 10 },
  { name: "Горошек зелёный", kcal: 81, protein: 5.4, fat: 0.4, carbs: 14.5, fiber: 5.1, portionG: 100 },
  { name: "Кукуруза консервированная", kcal: 86, protein: 3.2, fat: 1.2, carbs: 19, fiber: 2.7, portionG: 100 },
  { name: "Шпинат", kcal: 23, protein: 2.9, fat: 0.4, carbs: 3.6, fiber: 2.2, portionG: 100 },
  { name: "Зелень свежая", kcal: 43, protein: 3.7, fat: 1.1, carbs: 7, fiber: 3.5, portionG: 20 },
  { name: "Шампиньоны", kcal: 22, protein: 3.1, fat: 0.3, carbs: 3.3, fiber: 1, portionG: 150 },

  // Орехи и семена
  { name: "Фундук", kcal: 628, protein: 15, fat: 61, carbs: 16.7, fiber: 9.7, portionG: 30 },
  { name: "Кешью", kcal: 553, protein: 18.2, fat: 43.9, carbs: 30.2, fiber: 3.3, portionG: 30 },
  { name: "Фисташки", kcal: 560, protein: 20.2, fat: 45.3, carbs: 27.2, fiber: 10.6, portionG: 30 },
  { name: "Арахис", kcal: 567, protein: 25.8, fat: 49.2, carbs: 16.1, fiber: 8.5, portionG: 30 },
  { name: "Семечки подсолнечные", kcal: 584, protein: 20.8, fat: 51.5, carbs: 20, fiber: 8.6, portionG: 30 },
  { name: "Кунжут", kcal: 573, protein: 17.7, fat: 49.7, carbs: 23.4, fiber: 11.8, portionG: 15 },
  { name: "Семена чиа", kcal: 486, protein: 16.5, fat: 30.7, carbs: 42.1, fiber: 34.4, portionG: 20 },

  // Молочное
  { name: "Ряженка 4%", kcal: 67, protein: 2.9, fat: 4, carbs: 4.2, fiber: 0, portionG: 200 },
  { name: "Творог 9%", kcal: 159, protein: 16.7, fat: 9, carbs: 2, fiber: 0, portionG: 150 },
  { name: "Сыр плавленый", kcal: 290, protein: 12, fat: 25, carbs: 4, fiber: 0, portionG: 30 },
  { name: "Брынза", kcal: 260, protein: 17.9, fat: 20.1, carbs: 0.4, fiber: 0, portionG: 50 },
  { name: "Сливки 10%", kcal: 118, protein: 3, fat: 10, carbs: 4, fiber: 0, portionG: 50 },

  // Гарниры и каши — тоже в готовом виде
  { name: "Пшённая каша на воде", kcal: 90, protein: 3, fat: 0.7, carbs: 17, fiber: 1.3, portionG: 200 },
  { name: "Манная каша на молоке", kcal: 98, protein: 3, fat: 3.2, carbs: 15.3, fiber: 0.2, portionG: 200 },
  { name: "Кускус отварной", kcal: 112, protein: 3.8, fat: 0.2, carbs: 23.2, fiber: 1.4, portionG: 150 },
  { name: "Картофельное пюре", kcal: 88, protein: 2, fat: 3, carbs: 13.5, fiber: 1.3, portionG: 200 },

  // Мясо, птица, рыба
  { name: "Куриная голень", kcal: 185, protein: 20, fat: 11, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Печень говяжья", kcal: 135, protein: 20.4, fat: 3.6, carbs: 4, fiber: 0, portionG: 100 },
  { name: "Ветчина", kcal: 165, protein: 17, fat: 10, carbs: 1.5, fiber: 0, portionG: 50 },
  { name: "Минтай отварной", kcal: 79, protein: 17.6, fat: 1, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Хек отварной", kcal: 95, protein: 18.5, fat: 2.3, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Икра красная", kcal: 250, protein: 24.6, fat: 17.9, carbs: 0, fiber: 0, portionG: 30 },
  { name: "Крабовые палочки", kcal: 88, protein: 6, fat: 1, carbs: 14, fiber: 0, portionG: 100 },

  // Хлеб и выпечка
  { name: "Батон нарезной", kcal: 264, protein: 7.5, fat: 2.9, carbs: 50.9, fiber: 2.5, portionG: 30 },
  { name: "Лаваш тонкий", kcal: 236, protein: 7.9, fat: 1, carbs: 47.6, fiber: 2, portionG: 60 },
  { name: "Пряник", kcal: 350, protein: 4.8, fat: 2.8, carbs: 77, fiber: 1.5, portionG: 40 },

  // Сладкое и соусы
  { name: "Сгущённое молоко", kcal: 320, protein: 7.2, fat: 8.5, carbs: 55.5, fiber: 0, portionG: 30 },
  { name: "Варенье", kcal: 260, protein: 0.4, fat: 0.2, carbs: 64, fiber: 0.8, portionG: 30 },
  { name: "Халва подсолнечная", kcal: 523, protein: 11.6, fat: 29.7, carbs: 54, fiber: 6.4, portionG: 30 },
  { name: "Хумус", kcal: 166, protein: 7.9, fat: 9.6, carbs: 14.3, fiber: 6, portionG: 50 },
  { name: "Соевый соус", kcal: 53, protein: 8.1, fat: 0.6, carbs: 4.9, fiber: 0.8, portionG: 15 },
  { name: "Горчица", kcal: 143, protein: 9.9, fat: 12.7, carbs: 5.3, fiber: 3.3, portionG: 10 },

  // Напитки
  { name: "Сок яблочный", kcal: 46, protein: 0.1, fat: 0.1, carbs: 11.3, fiber: 0.2, portionG: 200 },
  { name: "Компот из сухофруктов", kcal: 60, protein: 0.3, fat: 0, carbs: 15, fiber: 0.2, portionG: 200 },
  { name: "Кола", kcal: 42, protein: 0, fat: 0, carbs: 10.6, fiber: 0, portionG: 330 },

  // ------------------------------------------------------------------
  // Русская повседневная еда: готовые блюда, а не сырьё.
  //
  // Первая версия справочника была таблицей продуктов — курица, гречка,
  // творог. По ней нельзя записать обед: люди едят не «говядину отварную», а
  // борщ и котлету с пюре, и каждый раз упирались либо в разбор моделью, либо
  // в ручной ввод пяти чисел. Здесь то, что реально лежит в тарелке.
  //
  // Числа блюд, которые есть и на публичных страницах «сколько калорий»
  // (lib/dishes.ts), выбраны внутри опубликованных там диапазонов — тест
  // сверяет это. Одно и то же блюдо не может показывать на сайте одно, а в
  // дневнике другое.

  // Супы и первые блюда
  { name: "Борщ", kcal: 55, protein: 2.5, fat: 2.5, carbs: 5.5, fiber: 1.2, portionG: 350 },
  { name: "Щи из свежей капусты", kcal: 40, protein: 1.8, fat: 2, carbs: 3.5, fiber: 1.2, portionG: 350 },
  { name: "Солянка мясная", kcal: 90, protein: 6, fat: 6, carbs: 3, fiber: 0.6, portionG: 350 },
  { name: "Суп куриный с лапшой", kcal: 55, protein: 3.5, fat: 2, carbs: 5.5, fiber: 0.4, portionG: 350 },
  { name: "Уха", kcal: 45, protein: 5, fat: 1.5, carbs: 2.5, fiber: 0.3, portionG: 350 },
  { name: "Гороховый суп", kcal: 66, protein: 4, fat: 1.7, carbs: 9, fiber: 2, portionG: 350 },
  { name: "Грибной суп", kcal: 40, protein: 2, fat: 2, carbs: 3.5, fiber: 0.8, portionG: 350 },
  { name: "Окрошка на кефире", kcal: 55, protein: 3, fat: 2.4, carbs: 5, fiber: 0.7, portionG: 350 },
  { name: "Крем-суп тыквенный", kcal: 60, protein: 1.6, fat: 3.2, carbs: 6.5, fiber: 1.4, portionG: 300 },
  { name: "Бульон куриный", kcal: 20, protein: 2.5, fat: 1, carbs: 0.3, fiber: 0, portionG: 250 },

  // Вторые блюда
  { name: "Плов с курицей", kcal: 165, protein: 8, fat: 6, carbs: 20, fiber: 0.9, portionG: 250 },
  { name: "Пельмени отварные", kcal: 245, protein: 12, fat: 11, carbs: 25, fiber: 1, portionG: 250 },
  { name: "Вареники с картофелем", kcal: 185, protein: 5, fat: 6, carbs: 27, fiber: 1.5, portionG: 250 },
  { name: "Голубцы", kcal: 120, protein: 6, fat: 6.5, carbs: 9, fiber: 1.4, portionG: 250 },
  { name: "Котлета из свинины и говядины", kcal: 250, protein: 14, fat: 18, carbs: 8, fiber: 0.5, portionG: 100 },
  { name: "Котлета куриная", kcal: 200, protein: 15, fat: 12, carbs: 8, fiber: 0.4, portionG: 100 },
  { name: "Тефтели в соусе", kcal: 175, protein: 11, fat: 10, carbs: 10, fiber: 0.6, portionG: 200 },
  { name: "Гуляш говяжий", kcal: 180, protein: 14, fat: 11, carbs: 6, fiber: 0.4, portionG: 200 },
  { name: "Отбивная свиная", kcal: 280, protein: 20, fat: 20, carbs: 5, fiber: 0.2, portionG: 130 },
  { name: "Шницель куриный", kcal: 245, protein: 17, fat: 15, carbs: 11, fiber: 0.5, portionG: 130 },
  { name: "Рыба жареная", kcal: 190, protein: 18, fat: 11, carbs: 5, fiber: 0.2, portionG: 150 },
  { name: "Запеканка творожная", kcal: 170, protein: 12, fat: 6, carbs: 17, fiber: 0.3, portionG: 150 },
  { name: "Сырники", kcal: 220, protein: 14, fat: 9, carbs: 21, fiber: 0.3, portionG: 150 },
  { name: "Блины на молоке", kcal: 190, protein: 6, fat: 6.5, carbs: 27, fiber: 0.9, portionG: 150 },
  { name: "Оладьи", kcal: 230, protein: 6, fat: 9, carbs: 32, fiber: 1, portionG: 130 },
  { name: "Омлет с молоком", kcal: 165, protein: 10, fat: 12, carbs: 3, fiber: 0, portionG: 150 },
  { name: "Яичница глазунья", kcal: 195, protein: 12, fat: 15, carbs: 1, fiber: 0, portionG: 120 },
  { name: "Каша рисовая на молоке", kcal: 97, protein: 2.7, fat: 2.5, carbs: 16, fiber: 0.4, portionG: 250 },
  { name: "Каша гречневая на молоке", kcal: 105, protein: 4.2, fat: 2.8, carbs: 15.5, fiber: 1.8, portionG: 250 },
  { name: "Макароны по-флотски", kcal: 195, protein: 11, fat: 9, carbs: 18, fiber: 0.9, portionG: 250 },
  { name: "Картофель жареный", kcal: 195, protein: 2.8, fat: 9.5, carbs: 24, fiber: 2.2, portionG: 200 },
  { name: "Картофель тушёный", kcal: 105, protein: 2.2, fat: 3.5, carbs: 16, fiber: 1.8, portionG: 200 },
  { name: "Овощи тушёные", kcal: 70, protein: 1.6, fat: 3.6, carbs: 8, fiber: 2.2, portionG: 200 },
  { name: "Овощи на пару", kcal: 45, protein: 2, fat: 0.5, carbs: 7.5, fiber: 2.6, portionG: 200 },

  // Салаты
  { name: "Оливье", kcal: 200, protein: 5, fat: 15, carbs: 11, fiber: 1.2, portionG: 150 },
  { name: "Винегрет", kcal: 105, protein: 1.6, fat: 7, carbs: 9, fiber: 2, portionG: 150 },
  { name: "Салат «Цезарь» с курицей", kcal: 190, protein: 12, fat: 13, carbs: 6, fiber: 0.6, portionG: 200 },
  { name: "Салат «Мимоза»", kcal: 200, protein: 7, fat: 16, carbs: 7, fiber: 0.5, portionG: 150 },
  { name: "Сельдь под шубой", kcal: 185, protein: 6, fat: 14, carbs: 8, fiber: 1.2, portionG: 150 },
  { name: "Салат из огурцов и помидоров", kcal: 60, protein: 1.1, fat: 4.5, carbs: 3.6, fiber: 1, portionG: 150 },
  { name: "Салат «Греческий»", kcal: 120, protein: 3.6, fat: 9.5, carbs: 4.5, fiber: 1.2, portionG: 180 },

  // Фастфуд и уличная еда
  { name: "Шаурма с курицей", kcal: 195, protein: 11, fat: 10, carbs: 15, fiber: 1, portionG: 300 },
  { name: "Пицца «Маргарита»", kcal: 245, protein: 11, fat: 9.5, carbs: 29, fiber: 1.6, portionG: 200 },
  { name: "Пицца «Пепперони»", kcal: 285, protein: 12, fat: 13.5, carbs: 29, fiber: 1.6, portionG: 200 },
  { name: "Бургер с говядиной", kcal: 265, protein: 13, fat: 14, carbs: 21, fiber: 1.2, portionG: 200 },
  { name: "Хот-дог", kcal: 250, protein: 9, fat: 14, carbs: 21, fiber: 1, portionG: 150 },
  { name: "Наггетсы куриные", kcal: 290, protein: 15, fat: 18, carbs: 16, fiber: 0.8, portionG: 120 },
  { name: "Чебурек", kcal: 265, protein: 8, fat: 15, carbs: 24, fiber: 1.1, portionG: 130 },
  { name: "Беляш", kcal: 275, protein: 9, fat: 15, carbs: 26, fiber: 1.2, portionG: 110 },
  { name: "Пирожок с картошкой", kcal: 250, protein: 5, fat: 10, carbs: 35, fiber: 1.7, portionG: 100 },
  { name: "Хачапури", kcal: 285, protein: 12, fat: 15, carbs: 26, fiber: 1.1, portionG: 200 },
  { name: "Суши-ролл с лососем", kcal: 165, protein: 7, fat: 4.5, carbs: 24, fiber: 0.6, portionG: 200 },
  { name: "Роллы «Филадельфия»", kcal: 200, protein: 8, fat: 9, carbs: 22, fiber: 0.6, portionG: 200 },

  // Выпечка и десерты
  { name: "Круассан", kcal: 400, protein: 8, fat: 21, carbs: 45, fiber: 2, portionG: 60 },
  { name: "Булочка с маком", kcal: 335, protein: 7.5, fat: 8, carbs: 57, fiber: 1.8, portionG: 80 },
  { name: "Пончик", kcal: 380, protein: 6, fat: 19, carbs: 47, fiber: 1.5, portionG: 70 },
  { name: "Кекс", kcal: 385, protein: 6, fat: 17, carbs: 52, fiber: 1.2, portionG: 80 },
  { name: "Торт бисквитный с кремом", kcal: 350, protein: 4.5, fat: 17, carbs: 45, fiber: 0.8, portionG: 120 },
  { name: "Чизкейк", kcal: 320, protein: 6, fat: 20, carbs: 28, fiber: 0.4, portionG: 120 },
  { name: "Эклер", kcal: 330, protein: 6, fat: 20, carbs: 31, fiber: 0.5, portionG: 80 },
  { name: "Печенье песочное", kcal: 460, protein: 6, fat: 22, carbs: 60, fiber: 1.6, portionG: 40 },
  { name: "Вафли", kcal: 435, protein: 6, fat: 20, carbs: 58, fiber: 1.5, portionG: 40 },
  { name: "Шоколад горький 70%", kcal: 545, protein: 8, fat: 36, carbs: 46, fiber: 10, portionG: 30 },
  { name: "Мармелад", kcal: 305, protein: 0.4, fat: 0.1, carbs: 76, fiber: 0.5, portionG: 40 },
  { name: "Пастила", kcal: 320, protein: 0.5, fat: 0.1, carbs: 79, fiber: 0.6, portionG: 40 },
  { name: "Сгущёнка варёная", kcal: 320, protein: 7, fat: 8.5, carbs: 55, fiber: 0, portionG: 40 },
  { name: "Творожный сырок глазированный", kcal: 400, protein: 8, fat: 23, carbs: 40, fiber: 0.5, portionG: 45 },
  { name: "Батончик шоколадный", kcal: 480, protein: 6, fat: 24, carbs: 60, fiber: 1.5, portionG: 50 },
  { name: "Протеиновый батончик", kcal: 350, protein: 30, fat: 10, carbs: 33, fiber: 4, portionG: 50 },
  { name: "Чипсы картофельные", kcal: 525, protein: 6, fat: 32, carbs: 52, fiber: 4, portionG: 40 },
  { name: "Сухарики ржаные", kcal: 385, protein: 11, fat: 5, carbs: 74, fiber: 4.5, portionG: 40 },
  { name: "Попкорн солёный", kcal: 480, protein: 8, fat: 24, carbs: 58, fiber: 10, portionG: 40 },

  // Молочное
  { name: "Творог 2%", kcal: 95, protein: 18, fat: 2, carbs: 3.3, fiber: 0, portionG: 150 },
  { name: "Кефир 2,5%", kcal: 53, protein: 2.9, fat: 2.5, carbs: 4, fiber: 0, portionG: 250 },
  { name: "Йогурт питьевой", kcal: 70, protein: 2.8, fat: 1.6, carbs: 11.5, fiber: 0, portionG: 250 },
  { name: "Йогурт натуральный без сахара", kcal: 60, protein: 4.2, fat: 3, carbs: 4.2, fiber: 0, portionG: 150 },
  { name: "Молоко 3,2%", kcal: 60, protein: 2.9, fat: 3.2, carbs: 4.7, fiber: 0, portionG: 250 },
  { name: "Молоко обезжиренное", kcal: 33, protein: 3, fat: 0.1, carbs: 4.8, fiber: 0, portionG: 250 },
  { name: "Сметана 20%", kcal: 205, protein: 2.5, fat: 20, carbs: 3.4, fiber: 0, portionG: 30 },
  { name: "Сливочный сыр", kcal: 260, protein: 6, fat: 24, carbs: 4.5, fiber: 0, portionG: 30 },
  { name: "Сыр «Гауда»", kcal: 355, protein: 25, fat: 27, carbs: 2, fiber: 0, portionG: 30 },
  { name: "Сыр «Пармезан»", kcal: 390, protein: 33, fat: 28, carbs: 1.5, fiber: 0, portionG: 20 },
  { name: "Сыр «Адыгейский»", kcal: 240, protein: 19, fat: 18, carbs: 1.5, fiber: 0, portionG: 50 },
  { name: "Творожная масса с изюмом", kcal: 340, protein: 7, fat: 21, carbs: 30, fiber: 0.4, portionG: 100 },
  { name: "Айран", kcal: 30, protein: 1.7, fat: 1.5, carbs: 2.5, fiber: 0, portionG: 250 },
  { name: "Простокваша", kcal: 58, protein: 2.9, fat: 3.2, carbs: 4.1, fiber: 0, portionG: 250 },

  // Мясо, птица, рыба
  { name: "Куриное филе жареное", kcal: 195, protein: 27, fat: 9, carbs: 1, fiber: 0, portionG: 150 },
  { name: "Курица гриль с кожей", kcal: 235, protein: 24, fat: 15, carbs: 1, fiber: 0, portionG: 150 },
  { name: "Индейка запечённая", kcal: 165, protein: 26, fat: 6, carbs: 0.5, fiber: 0, portionG: 150 },
  { name: "Свинина тушёная", kcal: 230, protein: 17, fat: 17, carbs: 2, fiber: 0.1, portionG: 150 },
  { name: "Баранина отварная", kcal: 265, protein: 22, fat: 19, carbs: 0, fiber: 0, portionG: 130 },
  { name: "Печень куриная", kcal: 165, protein: 20, fat: 8, carbs: 2, fiber: 0, portionG: 120 },
  { name: "Сердце куриное", kcal: 155, protein: 16, fat: 10, carbs: 0.8, fiber: 0, portionG: 120 },
  { name: "Колбаса сырокопчёная", kcal: 460, protein: 20, fat: 42, carbs: 1, fiber: 0, portionG: 30 },
  { name: "Карбонад", kcal: 240, protein: 16, fat: 19, carbs: 1, fiber: 0, portionG: 60 },
  { name: "Сало солёное", kcal: 780, protein: 2, fat: 85, carbs: 0, fiber: 0, portionG: 20 },
  { name: "Форель запечённая", kcal: 190, protein: 21, fat: 11, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Горбуша отварная", kcal: 160, protein: 22, fat: 8, carbs: 0, fiber: 0, portionG: 150 },
  { name: "Сайра консервированная", kcal: 280, protein: 19, fat: 23, carbs: 0, fiber: 0, portionG: 80 },
  { name: "Килька в томате", kcal: 155, protein: 13, fat: 8, carbs: 5, fiber: 0.4, portionG: 100 },
  { name: "Кальмар отварной", kcal: 110, protein: 21, fat: 2.5, carbs: 0.5, fiber: 0, portionG: 120 },
  { name: "Мидии отварные", kcal: 90, protein: 15, fat: 2.5, carbs: 3.5, fiber: 0, portionG: 120 },
  { name: "Печень трески", kcal: 615, protein: 4, fat: 65, carbs: 1.2, fiber: 0, portionG: 30 },

  // Крупы, гарниры, хлеб
  { name: "Пшеничная каша на воде", kcal: 105, protein: 3.2, fat: 0.4, carbs: 22, fiber: 1.6, portionG: 200 },
  { name: "Ячневая каша на воде", kcal: 96, protein: 2.5, fat: 0.4, carbs: 20, fiber: 2.2, portionG: 200 },
  { name: "Полба отварная", kcal: 125, protein: 5.5, fat: 0.9, carbs: 24, fiber: 3.5, portionG: 200 },
  { name: "Рис для суши", kcal: 130, protein: 2.4, fat: 0.3, carbs: 29, fiber: 0.5, portionG: 200 },
  { name: "Лапша гречневая соба", kcal: 100, protein: 5, fat: 0.2, carbs: 20, fiber: 1.5, portionG: 200 },
  { name: "Хлеб бородинский", kcal: 205, protein: 6.5, fat: 1.3, carbs: 40, fiber: 5.8, portionG: 35 },
  { name: "Хлеб цельнозерновой", kcal: 230, protein: 9, fat: 3.5, carbs: 39, fiber: 6.5, portionG: 35 },
  { name: "Багет", kcal: 265, protein: 8.5, fat: 1.5, carbs: 53, fiber: 2.5, portionG: 50 },
  { name: "Тортилья пшеничная", kcal: 300, protein: 8, fat: 7, carbs: 50, fiber: 2.5, portionG: 60 },
  { name: "Мюсли с орехами", kcal: 400, protein: 10, fat: 13, carbs: 60, fiber: 7, portionG: 50 },
  { name: "Гранола", kcal: 430, protein: 9, fat: 15, carbs: 63, fiber: 6, portionG: 50 },
  { name: "Каша быстрого приготовления с сахаром", kcal: 355, protein: 9, fat: 4, carbs: 70, fiber: 5, portionG: 40 },

  // Овощи, фрукты, бобовые
  { name: "Помидоры черри", kcal: 20, protein: 0.9, fat: 0.2, carbs: 3.5, fiber: 1.2, portionG: 100 },
  { name: "Огурцы малосольные", kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.2, fiber: 0.8, portionG: 100 },
  { name: "Кабачки жареные", kcal: 90, protein: 1.2, fat: 6.5, carbs: 6.5, fiber: 1.2, portionG: 150 },
  { name: "Морковь по-корейски", kcal: 130, protein: 1.2, fat: 9, carbs: 11, fiber: 2.5, portionG: 100 },
  { name: "Свёкла запечённая", kcal: 50, protein: 1.7, fat: 0.2, carbs: 10, fiber: 2.6, portionG: 150 },
  { name: "Спаржа", kcal: 22, protein: 2.2, fat: 0.1, carbs: 3, fiber: 2.1, portionG: 150 },
  { name: "Стручковая фасоль", kcal: 30, protein: 1.8, fat: 0.2, carbs: 5, fiber: 2.6, portionG: 150 },
  { name: "Брюссельская капуста", kcal: 43, protein: 3.4, fat: 0.3, carbs: 6, fiber: 3.8, portionG: 150 },
  { name: "Сельдерей стеблевой", kcal: 14, protein: 0.7, fat: 0.2, carbs: 2.5, fiber: 1.6, portionG: 100 },
  { name: "Батат запечённый", kcal: 100, protein: 2, fat: 0.2, carbs: 22, fiber: 3.3, portionG: 200 },
  { name: "Кукуруза отварная", kcal: 105, protein: 3.5, fat: 1.5, carbs: 20, fiber: 2.5, portionG: 150 },
  { name: "Маш отварной", kcal: 105, protein: 7, fat: 0.4, carbs: 18, fiber: 7.5, portionG: 150 },
  { name: "Горох отварной", kcal: 115, protein: 8, fat: 0.5, carbs: 19, fiber: 6, portionG: 150 },
  { name: "Соя отварная", kcal: 145, protein: 14, fat: 6, carbs: 8, fiber: 5, portionG: 100 },
  { name: "Голубика", kcal: 45, protein: 0.7, fat: 0.3, carbs: 9, fiber: 2.4, portionG: 100 },
  { name: "Крыжовник", kcal: 44, protein: 0.7, fat: 0.2, carbs: 9, fiber: 3.4, portionG: 100 },
  { name: "Облепиха", kcal: 82, protein: 1.2, fat: 5.4, carbs: 5.5, fiber: 2, portionG: 50 },
  { name: "Клюква", kcal: 46, protein: 0.4, fat: 0.1, carbs: 12, fiber: 4.6, portionG: 50 },
  { name: "Кокос свежий", kcal: 354, protein: 3.3, fat: 33, carbs: 15, fiber: 9, portionG: 40 },
  { name: "Инжир свежий", kcal: 74, protein: 0.7, fat: 0.3, carbs: 16, fiber: 2.9, portionG: 80 },

  // Орехи и масла
  { name: "Пекан", kcal: 691, protein: 9.2, fat: 72, carbs: 14, fiber: 9.6, portionG: 25 },
  { name: "Бразильский орех", kcal: 656, protein: 14, fat: 66, carbs: 12, fiber: 7.5, portionG: 25 },
  { name: "Семена льна", kcal: 534, protein: 18, fat: 42, carbs: 29, fiber: 27, portionG: 15 },
  { name: "Семена тыквенные", kcal: 559, protein: 24, fat: 46, carbs: 15, fiber: 6, portionG: 25 },
  { name: "Масло подсолнечное", kcal: 899, protein: 0, fat: 99.9, carbs: 0, fiber: 0, portionG: 10 },
  { name: "Масло кокосовое", kcal: 890, protein: 0, fat: 99, carbs: 0, fiber: 0, portionG: 10 },
  { name: "Паста кунжутная тахини", kcal: 595, protein: 17, fat: 54, carbs: 10, fiber: 9, portionG: 20 },

  // Напитки
  { name: "Кофе с молоком без сахара", kcal: 30, protein: 1.6, fat: 1.6, carbs: 2.4, fiber: 0, portionG: 200 },
  { name: "Капучино без сахара", kcal: 40, protein: 2.2, fat: 2.1, carbs: 3.2, fiber: 0, portionG: 200 },
  { name: "Латте без сахара", kcal: 48, protein: 2.7, fat: 2.5, carbs: 4, fiber: 0, portionG: 250 },
  { name: "Какао на молоке", kcal: 70, protein: 3, fat: 2.8, carbs: 8.5, fiber: 0.4, portionG: 200 },
  { name: "Чай с сахаром", kcal: 28, protein: 0, fat: 0, carbs: 7, fiber: 0, portionG: 200 },
  { name: "Морс ягодный", kcal: 42, protein: 0.1, fat: 0, carbs: 10.4, fiber: 0.1, portionG: 250 },
  { name: "Квас", kcal: 27, protein: 0.2, fat: 0, carbs: 6.5, fiber: 0, portionG: 250 },
  { name: "Лимонад", kcal: 40, protein: 0, fat: 0, carbs: 10, fiber: 0, portionG: 250 },
  { name: "Сок томатный", kcal: 20, protein: 1, fat: 0.1, carbs: 3.5, fiber: 0.5, portionG: 250 },
  { name: "Пиво светлое", kcal: 43, protein: 0.5, fat: 0, carbs: 3.6, fiber: 0, portionG: 250, alcohol: 3.9 },
  { name: "Вино сухое красное", kcal: 68, protein: 0.2, fat: 0, carbs: 2.6, fiber: 0, portionG: 150, alcohol: 8.6 },
  { name: "Смузи фруктовый", kcal: 60, protein: 0.8, fat: 0.3, carbs: 13.5, fiber: 1.4, portionG: 250 },
  { name: "Протеиновый коктейль на воде", kcal: 45, protein: 9, fat: 0.6, carbs: 1.2, fiber: 0.3, portionG: 300 },
];


function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

function commonPrefix(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Совпадение слова с поправкой на русские окончания.
 *
 * Поиск по вхождению искал запрос ВНУТРИ названия, и потому находил продукт
 * только при точном совпадении формы слова. «Помидоры», «яблоки», «огурцы»,
 * «бананы» не находили ничего — хотя «Помидор», «Яблоко», «Огурец» и «Банан»
 * в справочнике есть. А по-русски еду пишут во множественном числе, так что
 * справочник был наполовину недоступен там, где продукт в нём был.
 *
 * Сравниваем по общему корню в обе стороны. Порог в четыре буквы и «не
 * длиннее корня плюс два окончания» подобран так, чтобы «огурцы» находили
 * «огурец», но «груша» не находила «грудку»: у них общего только «гру».
 */
const MIN_STEM = 4;
const MAX_ENDING = 2;

/** 2 — слово начинается с запроса, 1 — совпал только корень, 0 — не совпало. */
function matchQuality(word: string, needle: string): 0 | 1 | 2 {
  if (word.startsWith(needle) || needle.startsWith(word)) return 2;
  const shared = commonPrefix(word, needle);
  return shared >= MIN_STEM && shared >= Math.min(word.length, needle.length) - MAX_ENDING ? 1 : 0;
}

/**
 * Поиск по справочнику. Вперёд выходит то, что начинается с запроса: по «мол»
 * сначала «Молоко», а потом «Шоколад молочный». При равенстве — что короче:
 * короткое название почти всегда и есть основной продукт.
 *
 * Все слова запроса должны найтись в названии: «куриная грудка» обязана
 * попасть в грудку, а не в любое блюдо, где встретилось одно из двух слов.
 *
 * Точное начало слова идёт впереди совпадения по корню, и это не мелочь:
 * «греческ» иначе поднимает «Гречку» выше «Йогурта греческого», потому что у
 * них общие четыре буквы, а гречка стоит первым словом в названии.
 */
export function searchFoodReference(query: string, limit = 8): ReferenceFood[] {
  const needles = normalize(query).split(/[^a-zа-я0-9]+/).filter((word) => word.length >= 2);
  if (needles.length === 0) return [];

  return FOOD_REFERENCE
    .map((food) => {
      const words = normalize(food.name).split(/[^a-zа-я0-9]+/).filter(Boolean);
      // Позиция самого раннего совпавшего слова задаёт порядок внутри
      // одинакового качества; качество берём худшее из слов запроса.
      let earliest = Number.POSITIVE_INFINITY;
      let quality = 2;
      for (const needle of needles) {
        let best = 0;
        let at = -1;
        words.forEach((word, index) => {
          const q = matchQuality(word, needle);
          if (q > best) {
            best = q;
            at = index;
          }
        });
        if (best === 0) return null;
        quality = Math.min(quality, best);
        earliest = Math.min(earliest, at);
      }
      return { food, at: earliest, quality };
    })
    .filter((row): row is { food: ReferenceFood; at: number; quality: number } => row !== null)
    .sort((a, b) => b.quality - a.quality || a.at - b.at || a.food.name.length - b.food.name.length)
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
