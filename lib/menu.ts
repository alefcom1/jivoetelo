/**
 * Меню на день: рационы и сборка дня под нужную калорийность.
 *
 * ## Почему рационы, а не блюда
 *
 * Западные планировщики держат пул готовых блюд («Pesto Pasta», «Dal Chawal»)
 * и тянут из него по калорийности. Отсюда два их родовых недостатка: блюдо —
 * непрозрачный блок, из которого нельзя собрать список покупок, и попасть в
 * цель таким набором можно только случайно.
 *
 * У нас справочник — это компоненты: «гречка отварная», «куриная грудка».
 * Поэтому рацион здесь — не блюдо, а связка из двух-четырёх позиций с
 * граммовками. Из этого следует всё остальное: КБЖУ считается по составу и
 * сходится по определению, порции масштабируются под цель, а список покупок
 * получается сложением компонентов.
 *
 * ## Почему приём пищи задан явно
 *
 * У SnapCalorie в плане на завтрак попадает korma, а на перекус — торт: пул
 * общий, слот выбирается по калорийности. Здесь слот — свойство рациона, и
 * «куриная грудка на завтрак» не может появиться в принципе.
 *
 * ## Границы честности
 *
 * Сгенерированное меню — не назначение. Это пример того, как выглядит день на
 * такой калорийности, и годится он как отправная точка, а не как предписание.
 * Это написано и на самой странице: обещать «персональный план питания» по
 * четырём цифрам мы не будем.
 */

import { FOOD_REFERENCE } from "./food-reference.ts";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  snack: "Перекус",
  dinner: "Ужин",
};

/**
 * Как распределяется суточная калорийность по приёмам пищи.
 *
 * Числа не из рекомендаций — их там нет: жёсткого «правильного» распределения
 * не существует, и человек, который ест плотный ужин, ничего не нарушает. Это
 * просто привычная для России раскладка, от которой удобно отталкиваться.
 */
export const SLOT_SHARE: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  snack: 0.1,
  dinner: 0.3,
};

/** Ограничения, по которым люди действительно фильтруют еду. */
export type MenuFilter = "noMeat" | "noDairy" | "quick" | "cheap";

export const FILTER_LABELS: Record<MenuFilter, string> = {
  noMeat: "Без мяса и рыбы",
  noDairy: "Без молочного",
  quick: "Быстро, без готовки",
  cheap: "Недорого",
};

export const FILTER_NOTES: Record<MenuFilter, string> = {
  noMeat: "Вегетарианские рационы: яйца и молочное остаются, мясо и рыба — нет.",
  noDairy: "Без молока, творога, сыра и сметаны. Не то же самое, что безлактозное: следы возможны.",
  quick: "Собирается за десять-пятнадцать минут или не требует плиты вовсе.",
  cheap: "Из продуктов, которые есть в любом магазине по невысокой цене.",
};

export type Ration = {
  id: string;
  slot: MealSlot;
  title: string;
  items: Array<{ name: string; grams: number }>;
  tags: MenuFilter[];
};

/**
 * Рационы. Каждая позиция — название из справочника: если продукт
 * переименуют, тест это поймает, а не пользователь увидит нулевые калории.
 */
export const RATIONS: Ration[] = [
  // ===== Завтраки =====
  {
    id: "b-oatmeal-berries", slot: "breakfast", title: "Овсянка с черникой и миндалём",
    items: [{ name: "Овсянка на воде", grams: 250 }, { name: "Черника", grams: 60 }, { name: "Миндаль", grams: 15 }, { name: "Мёд", grams: 10 }],
    tags: ["noMeat", "noDairy"],
  },
  {
    id: "b-curd-banana", slot: "breakfast", title: "Творог с бананом и грецким орехом",
    items: [{ name: "Творог 5%", grams: 180 }, { name: "Банан", grams: 100 }, { name: "Грецкий орех", grams: 15 }],
    tags: ["noMeat", "quick", "cheap"],
  },
  {
    id: "b-omelet-tomato", slot: "breakfast", title: "Омлет с помидорами и ржаным хлебом",
    items: [{ name: "Омлет с молоком", grams: 200 }, { name: "Помидор", grams: 100 }, { name: "Хлеб ржаной", grams: 40 }],
    tags: ["noMeat", "quick"],
  },
  {
    id: "b-buckwheat-milk", slot: "breakfast", title: "Гречневая каша на молоке",
    items: [{ name: "Каша гречневая на молоке", grams: 280 }, { name: "Масло сливочное 82%", grams: 8 }],
    tags: ["noMeat", "cheap"],
  },
  {
    id: "b-eggs-veg", slot: "breakfast", title: "Яичница с овощами и хлебцами",
    items: [{ name: "Яичница глазунья", grams: 140 }, { name: "Огурец", grams: 80 }, { name: "Помидор", grams: 80 }, { name: "Хлебцы цельнозерновые", grams: 20 }],
    tags: ["noMeat", "noDairy", "quick", "cheap"],
  },
  {
    id: "b-syrniki", slot: "breakfast", title: "Сырники со сметаной",
    items: [{ name: "Сырники", grams: 150 }, { name: "Сметана 15%", grams: 30 }],
    tags: ["noMeat"],
  },
  {
    id: "b-salmon-toast", slot: "breakfast", title: "Тосты с творожным сыром и лососем",
    items: [{ name: "Хлеб цельнозерновой", grams: 60 }, { name: "Сливочный сыр", grams: 30 }, { name: "Лосось запечённый", grams: 60 }],
    tags: ["quick"],
  },
  {
    id: "b-rice-apricot", slot: "breakfast", title: "Рисовая каша с курагой",
    items: [{ name: "Каша рисовая на молоке", grams: 280 }, { name: "Курага", grams: 30 }],
    tags: ["noMeat", "cheap"],
  },
  {
    id: "b-yogurt-granola", slot: "breakfast", title: "Йогурт с гранолой и клубникой",
    items: [{ name: "Йогурт натуральный без сахара", grams: 180 }, { name: "Гранола", grams: 40 }, { name: "Клубника", grams: 80 }],
    tags: ["noMeat", "quick"],
  },
  {
    id: "b-millet-pumpkin", slot: "breakfast", title: "Пшённая каша с тыквой",
    items: [{ name: "Пшённая каша на воде", grams: 250 }, { name: "Тыква запечённая", grams: 100 }, { name: "Масло сливочное 82%", grams: 8 }],
    tags: ["noMeat", "cheap"],
  },
  {
    id: "b-avocado-egg", slot: "breakfast", title: "Тост с авокадо и яйцом",
    items: [{ name: "Хлеб цельнозерновой", grams: 60 }, { name: "Авокадо", grams: 70 }, { name: "Яйцо куриное", grams: 55 }],
    tags: ["noMeat", "noDairy", "quick"],
  },
  {
    id: "b-oat-milk-raisins", slot: "breakfast", title: "Овсянка с изюмом и семенами льна",
    items: [{ name: "Овсянка на воде", grams: 260 }, { name: "Изюм", grams: 30 }, { name: "Семена льна", grams: 10 }],
    tags: ["noMeat", "noDairy", "quick", "cheap"],
  },
  {
    id: "b-casserole-apple", slot: "breakfast", title: "Творожная запеканка с яблоком",
    items: [{ name: "Запеканка творожная", grams: 180 }, { name: "Яблоко", grams: 100 }],
    tags: ["noMeat"],
  },

  // ===== Обеды =====
  {
    id: "l-buckwheat-chicken", slot: "lunch", title: "Гречка с куриной грудкой и салатом",
    items: [{ name: "Гречка отварная", grams: 200 }, { name: "Куриная грудка отварная", grams: 130 }, { name: "Салат из огурцов и помидоров", grams: 120 }],
    tags: ["noDairy", "cheap"],
  },
  {
    id: "l-borsch", slot: "lunch", title: "Борщ со сметаной и ржаным хлебом",
    items: [{ name: "Борщ", grams: 350 }, { name: "Сметана 15%", grams: 20 }, { name: "Хлеб ржаной", grams: 40 }],
    tags: ["cheap"],
  },
  {
    id: "l-rice-cod", slot: "lunch", title: "Бурый рис с треской и овощами на пару",
    items: [{ name: "Рис бурый отварной", grams: 180 }, { name: "Треска отварная", grams: 150 }, { name: "Овощи на пару", grams: 150 }],
    tags: ["noDairy"],
  },
  {
    id: "l-schi-beef", slot: "lunch", title: "Щи с говядиной и бородинским хлебом",
    items: [{ name: "Щи из свежей капусты", grams: 350 }, { name: "Говядина отварная", grams: 80 }, { name: "Хлеб бородинский", grams: 40 }],
    tags: ["noDairy", "cheap"],
  },
  {
    id: "l-pasta-turkey", slot: "lunch", title: "Паста с индейкой и помидорами",
    items: [{ name: "Макароны отварные", grams: 200 }, { name: "Филе индейки", grams: 120 }, { name: "Помидор", grams: 100 }],
    tags: ["noDairy"],
  },
  {
    id: "l-lentils-cheese", slot: "lunch", title: "Чечевица с тушёными овощами и брынзой",
    items: [{ name: "Чечевица отварная", grams: 200 }, { name: "Овощи тушёные", grams: 150 }, { name: "Брынза", grams: 40 }],
    tags: ["noMeat"],
  },
  {
    id: "l-plov", slot: "lunch", title: "Плов с курицей и салатом",
    items: [{ name: "Плов с курицей", grams: 250 }, { name: "Салат из огурцов и помидоров", grams: 120 }],
    tags: ["noDairy"],
  },
  {
    id: "l-potato-pollock", slot: "lunch", title: "Картофель с минтаем и квашеной капустой",
    items: [{ name: "Картофель отварной", grams: 200 }, { name: "Минтай отварной", grams: 150 }, { name: "Капуста квашеная", grams: 100 }],
    tags: ["noDairy", "cheap"],
  },
  {
    id: "l-bulgur-cutlet", slot: "lunch", title: "Булгур с куриной котлетой и брокколи",
    items: [{ name: "Булгур отварной", grams: 180 }, { name: "Котлета куриная", grams: 100 }, { name: "Брокколи", grams: 150 }],
    tags: ["noDairy"],
  },
  {
    id: "l-chicken-soup", slot: "lunch", title: "Куриный суп и бутерброд с сыром",
    items: [{ name: "Суп куриный с лапшой", grams: 350 }, { name: "Хлеб ржаной", grams: 40 }, { name: "Сыр российский", grams: 25 }],
    tags: ["cheap"],
  },
  {
    id: "l-chickpeas", slot: "lunch", title: "Нут с овощами и зеленью",
    items: [{ name: "Нут отварной", grams: 200 }, { name: "Овощи тушёные", grams: 150 }, { name: "Зелень свежая", grams: 20 }, { name: "Масло оливковое", grams: 10 }],
    tags: ["noMeat", "noDairy", "cheap"],
  },
  {
    id: "l-pearl-goulash", slot: "lunch", title: "Перловка с говяжьим гуляшом",
    items: [{ name: "Перловка отварная", grams: 180 }, { name: "Гуляш говяжий", grams: 150 }],
    tags: ["noDairy", "cheap"],
  },
  {
    id: "l-greek-lavash", slot: "lunch", title: "Греческий салат с лавашом и яйцом",
    items: [{ name: "Салат «Греческий»", grams: 250 }, { name: "Лаваш тонкий", grams: 60 }, { name: "Яйцо куриное", grams: 55 }],
    tags: ["noMeat", "quick"],
  },
  {
    id: "l-hummus-lavash", slot: "lunch", title: "Хумус с лавашом и овощами",
    items: [{ name: "Хумус", grams: 120 }, { name: "Лаваш тонкий", grams: 60 }, { name: "Перец болгарский", grams: 100 }, { name: "Огурец", grams: 100 }],
    tags: ["noMeat", "noDairy", "quick", "cheap"],
  },
  {
    id: "l-tuna-pasta", slot: "lunch", title: "Макароны с тунцом и помидорами",
    items: [{ name: "Макароны отварные", grams: 200 }, { name: "Тунец в собственном соку", grams: 120 }, { name: "Помидоры черри", grams: 100 }],
    tags: ["noDairy", "quick", "cheap"],
  },

  // ===== Ужины =====
  {
    id: "d-salmon-quinoa", slot: "dinner", title: "Лосось с киноа и спаржей",
    items: [{ name: "Лосось запечённый", grams: 140 }, { name: "Киноа отварная", grams: 150 }, { name: "Спаржа", grams: 120 }],
    tags: ["noDairy"],
  },
  {
    id: "d-thigh-steamed", slot: "dinner", title: "Куриное бедро с овощами на пару",
    items: [{ name: "Куриное бедро без кожи", grams: 150 }, { name: "Овощи на пару", grams: 200 }],
    tags: ["noDairy", "cheap"],
  },
  {
    id: "d-curd-cucumber", slot: "dinner", title: "Творог с огурцом и хлебцами",
    items: [{ name: "Творог 5%", grams: 200 }, { name: "Огурец", grams: 100 }, { name: "Хлебцы цельнозерновые", grams: 20 }],
    tags: ["noMeat", "quick", "cheap"],
  },
  {
    id: "d-omelet-mushrooms", slot: "dinner", title: "Омлет с шампиньонами и салатом",
    items: [{ name: "Омлет с молоком", grams: 200 }, { name: "Шампиньоны", grams: 100 }, { name: "Салат листовой", grams: 60 }],
    tags: ["noMeat"],
  },
  {
    id: "d-cod-mash", slot: "dinner", title: "Треска с картофельным пюре и салатом",
    items: [{ name: "Треска отварная", grams: 160 }, { name: "Картофельное пюре", grams: 180 }, { name: "Салат из огурцов и помидоров", grams: 100 }],
    tags: ["cheap"],
  },
  {
    id: "d-turkey-buckwheat", slot: "dinner", title: "Индейка с гречкой и квашеной капустой",
    items: [{ name: "Индейка запечённая", grams: 130 }, { name: "Гречка отварная", grams: 150 }, { name: "Капуста квашеная", grams: 100 }],
    tags: ["noDairy", "cheap"],
  },
  {
    id: "d-tofu-rice", slot: "dinner", title: "Тофу с овощами и бурым рисом",
    items: [{ name: "Тофу", grams: 150 }, { name: "Овощи тушёные", grams: 180 }, { name: "Рис бурый отварной", grams: 120 }],
    tags: ["noMeat", "noDairy"],
  },
  {
    id: "d-mackerel-vinegret", slot: "dinner", title: "Скумбрия с винегретом",
    items: [{ name: "Скумбрия", grams: 120 }, { name: "Винегрет", grams: 200 }],
    tags: ["noDairy"],
  },
  {
    id: "d-beans-egg", slot: "dinner", title: "Фасоль с яйцом и зеленью",
    items: [{ name: "Фасоль отварная", grams: 200 }, { name: "Яйцо куриное", grams: 55 }, { name: "Зелень свежая", grams: 20 }],
    tags: ["noMeat", "noDairy", "quick", "cheap"],
  },
  {
    id: "d-breast-stewed", slot: "dinner", title: "Куриная грудка с тушёными овощами",
    items: [{ name: "Куриная грудка отварная", grams: 150 }, { name: "Овощи тушёные", grams: 200 }],
    tags: ["noDairy", "cheap"],
  },
  {
    id: "d-squid-salad", slot: "dinner", title: "Кальмар с салатом и авокадо",
    items: [{ name: "Кальмар отварной", grams: 150 }, { name: "Салат листовой", grams: 80 }, { name: "Авокадо", grams: 60 }, { name: "Масло оливковое", grams: 8 }],
    tags: ["noDairy", "quick"],
  },
  {
    id: "d-herring-potato", slot: "dinner", title: "Сельдь с отварным картофелем и луком",
    items: [{ name: "Сельдь солёная", grams: 100 }, { name: "Картофель отварной", grams: 200 }, { name: "Лук репчатый", grams: 30 }],
    tags: ["noDairy", "quick", "cheap"],
  },
  {
    id: "d-batat-curd", slot: "dinner", title: "Запечённый батат с творогом и зеленью",
    items: [{ name: "Батат запечённый", grams: 200 }, { name: "Творог 5%", grams: 150 }, { name: "Зелень свежая", grams: 20 }],
    tags: ["noMeat"],
  },

  // ===== Перекусы =====
  {
    id: "s-apple-almond", slot: "snack", title: "Яблоко и миндаль",
    items: [{ name: "Яблоко", grams: 180 }, { name: "Миндаль", grams: 20 }],
    tags: ["noMeat", "noDairy", "quick", "cheap"],
  },
  {
    id: "s-greek-blueberry", slot: "snack", title: "Греческий йогурт с черникой",
    items: [{ name: "Йогурт греческий 2%", grams: 150 }, { name: "Черника", grams: 60 }],
    tags: ["noMeat", "quick"],
  },
  {
    id: "s-kefir-crispbread", slot: "snack", title: "Кефир и хлебцы",
    items: [{ name: "Кефир 1%", grams: 250 }, { name: "Хлебцы цельнозерновые", grams: 20 }],
    tags: ["noMeat", "quick", "cheap"],
  },
  {
    id: "s-banana-peanut", slot: "snack", title: "Банан с арахисовой пастой",
    items: [{ name: "Банан", grams: 120 }, { name: "Арахисовая паста", grams: 20 }],
    tags: ["noMeat", "noDairy", "quick"],
  },
  {
    id: "s-curd-apricot", slot: "snack", title: "Творог с курагой",
    items: [{ name: "Творог 2%", grams: 150 }, { name: "Курага", grams: 25 }],
    tags: ["noMeat", "quick"],
  },
  {
    id: "s-hummus-veg", slot: "snack", title: "Хумус с овощными палочками",
    items: [{ name: "Хумус", grams: 60 }, { name: "Морковь", grams: 100 }, { name: "Перец болгарский", grams: 100 }],
    tags: ["noMeat", "noDairy", "quick"],
  },
  {
    id: "s-walnut-pear", slot: "snack", title: "Грецкий орех и груша",
    items: [{ name: "Грецкий орех", grams: 20 }, { name: "Груша", grams: 180 }],
    tags: ["noMeat", "noDairy", "quick"],
  },
  {
    id: "s-cheese-bread", slot: "snack", title: "Бутерброд с сыром",
    items: [{ name: "Хлеб цельнозерновой", grams: 40 }, { name: "Сыр российский", grams: 25 }],
    tags: ["noMeat", "quick", "cheap"],
  },
  {
    id: "s-ryazhenka-cookie", slot: "snack", title: "Ряженка и овсяное печенье",
    items: [{ name: "Ряженка 4%", grams: 200 }, { name: "Печенье овсяное", grams: 30 }],
    tags: ["noMeat", "quick", "cheap"],
  },
  {
    id: "s-eggs-cherry", slot: "snack", title: "Два яйца и помидоры черри",
    items: [{ name: "Яйцо куриное", grams: 110 }, { name: "Помидоры черри", grams: 100 }],
    tags: ["noMeat", "noDairy", "quick", "cheap"],
  },
  {
    id: "s-smoothie", slot: "snack", title: "Фруктовый смузи",
    items: [{ name: "Смузи фруктовый", grams: 250 }],
    tags: ["noMeat", "noDairy", "quick"],
  },
  {
    id: "s-cottage-bar", slot: "snack", title: "Творожный сырок и чай",
    items: [{ name: "Творожный сырок глазированный", grams: 50 }, { name: "Чай без сахара", grams: 200 }],
    tags: ["noMeat", "quick", "cheap"],
  },
];

export type Nutrients = { kcal: number; protein: number; fat: number; carbs: number; fiber: number };

/** КБЖУ набора позиций с граммовками. */
export function sumItems(items: Array<{ name: string; grams: number }>): Nutrients {
  const total = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  for (const item of items) {
    const food = FOOD_REFERENCE.find((f) => f.name === item.name);
    if (!food) continue;
    const k = item.grams / 100;
    total.kcal += food.kcal * k;
    total.protein += food.protein * k;
    total.fat += food.fat * k;
    total.carbs += food.carbs * k;
    total.fiber += food.fiber * k;
  }
  return {
    kcal: Math.round(total.kcal),
    protein: round1(total.protein),
    fat: round1(total.fat),
    carbs: round1(total.carbs),
    fiber: round1(total.fiber),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Рационы слота, подходящие под все выбранные ограничения. */
export function rationsFor(slot: MealSlot, filters: MenuFilter[]): Ration[] {
  return RATIONS.filter(
    (ration) => ration.slot === slot && filters.every((filter) => ration.tags.includes(filter)),
  );
}

export type PlannedMeal = {
  slot: MealSlot;
  ration: Ration;
  /** Позиции с граммовками после подгонки под калорийность. */
  items: Array<{ name: string; grams: number }>;
  nutrients: Nutrients;
  /** Во сколько раз порция отличается от базовой. */
  factor: number;
  /** Добавочный перекус: появляется, когда четырёх приёмов пищи не хватает. */
  extra?: boolean;
};

export type DayPlan = {
  meals: PlannedMeal[];
  total: Nutrients;
  targetKcal: number;
  /** Расхождение с целью, %. Со знаком: минус — недобрали. */
  deviation: number;
  /** Слоты, для которых при таких ограничениях рационов не нашлось. */
  missing: MealSlot[];
};

/**
 * Масштаб порции ограничен: рацион можно увеличить в полтора раза или
 * уменьшить на треть, но не превратить завтрак в двойной обед. Из-за этого
 * на краях калорийности день не всегда попадает в цель точно — и тогда мы
 * говорим об этом прямо, а не подгоняем цифру.
 */
const MIN_FACTOR = 0.65;
const MAX_FACTOR = 1.6;

/**
 * Границы калорийности, на которых калькулятор честно работает.
 *
 * Ниже 1200 суточная норма для взрослого — уже не самостоятельное решение, а
 * зона врачебного наблюдения, и предлагать туда готовое меню мы не будем.
 * Выше 3500 набор даже из восьми приёмов пищи перестаёт дотягиваться, а
 * спортивное питание такого объёма — отдельная задача, которую обычными
 * тарелками не решают.
 */
export const MIN_TARGET = 1200;
export const MAX_TARGET = 3500;

/** Сколько добавочных перекусов допустимо, прежде чем день станет нелепым. */
const MAX_EXTRA_SNACKS = 4;

/**
 * Собирает день под целевую калорийность.
 *
 * `picks` — номер выбранного рациона в каждом слоте: так работает
 * «заменить блюдо», и так же обеспечивается совпадение разметки на сервере и
 * в браузере. Случайность в рендере сломала бы гидратацию.
 */
export function buildDay(
  targetKcal: number,
  filters: MenuFilter[],
  picks: Partial<Record<MealSlot, number>> = {},
): DayPlan {
  const target = Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(targetKcal)));
  const missing = MEAL_SLOTS.filter((slot) => rationsFor(slot, filters).length === 0);
  const snacks = rationsFor("snack", filters);

  /*
   * Сколько приёмов пищи нужно.
   *
   * Порцию можно увеличить в полтора раза, но не втрое: иначе на трёх тысячах
   * килокалорий вместо обеда получается ведро гречки. Человек на такой
   * калорийности и правда ест пять-шесть раз в день — значит, добирать надо
   * приёмами пищи, а не размером тарелки. Подбираем число добавочных
   * перекусов так, чтобы день дотянулся до цели при разумных порциях.
   */
  let meals: PlannedMeal[] = [];
  for (let extras = 0; extras <= MAX_EXTRA_SNACKS; extras += 1) {
    meals = assemble(target, filters, picks, extras, missing);
    const reached = meals.reduce((sum, meal) => sum + meal.nutrients.kcal, 0);
    if (reached >= target * 0.95 || snacks.length === 0) break;
  }

  const total = meals.reduce<Nutrients>((sum, meal) => ({
    kcal: sum.kcal + meal.nutrients.kcal,
    protein: round1(sum.protein + meal.nutrients.protein),
    fat: round1(sum.fat + meal.nutrients.fat),
    carbs: round1(sum.carbs + meal.nutrients.carbs),
    fiber: round1(sum.fiber + meal.nutrients.fiber),
  }), { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });

  return {
    meals, total, targetKcal: target, missing,
    deviation: Math.round(((total.kcal - target) / target) * 1000) / 10,
  };
}

/**
 * Собирает набор приёмов пищи с заданным числом добавочных перекусов.
 *
 * Доли слотов нормируются на состав набора: добавочный перекус берёт свою
 * долю не из воздуха, иначе сумма долей перестала бы давать единицу и день
 * систематически перебирал бы цель.
 */
function assemble(
  target: number,
  filters: MenuFilter[],
  picks: Partial<Record<MealSlot, number>>,
  extras: number,
  missing: MealSlot[],
): PlannedMeal[] {
  const plan: Array<{ slot: MealSlot; pick: number; share: number; extra: boolean }> = [];

  for (const slot of MEAL_SLOTS) {
    if (missing.includes(slot)) continue;
    plan.push({ slot, pick: picks[slot] ?? 0, share: SLOT_SHARE[slot], extra: false });
  }
  for (let i = 0; i < extras; i += 1) {
    if (missing.includes("snack")) break;
    plan.push({ slot: "snack", pick: (picks.snack ?? 0) + 1 + i, share: SLOT_SHARE.snack, extra: true });
  }

  const shareSum = plan.reduce((sum, row) => sum + row.share, 0) || 1;
  return plan.map((row) => {
    const meal = planMeal(row.slot, rationsFor(row.slot, filters), row.pick, (target * row.share) / shareSum);
    return row.extra ? { ...meal, extra: true } : meal;
  });
}

/** Один приём пищи: выбор рациона по номеру и подгонка порции под долю дня. */
function planMeal(slot: MealSlot, available: Ration[], pick: number, slotTarget: number): PlannedMeal {
  const index = ((pick % available.length) + available.length) % available.length;
  const ration = available[index];
  const base = sumItems(ration.items);

  const raw = base.kcal > 0 ? slotTarget / base.kcal : 1;
  const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, raw));
  // Граммовки округляем до пяти: на кухонных весах меньше не отмеряют, а
  // дробные «137 г творога» выглядят точностью, которой здесь нет.
  const items = ration.items.map((item) => ({
    name: item.name,
    grams: Math.max(5, Math.round((item.grams * factor) / 5) * 5),
  }));

  return { slot, ration, items, nutrients: sumItems(items), factor: Math.round(factor * 100) / 100 };
}

/**
 * Список покупок: те же позиции, сложенные по названию.
 *
 * Ради этого всё и затевалось с компонентами: из непрозрачного «блюда» такой
 * список не собрать, и поэтому его нет ни у одного планировщика, который
 * тянет готовые блюда из пула.
 */
export function shoppingList(plans: DayPlan[]): Array<{ name: string; grams: number }> {
  const totals = new Map<string, number>();
  for (const plan of plans) {
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        totals.set(item.name, (totals.get(item.name) ?? 0) + item.grams);
      }
    }
  }
  return [...totals.entries()]
    .map(([name, grams]) => ({ name, grams: Math.round(grams / 5) * 5 }))
    .sort((a, b) => b.grams - a.grams);
}
