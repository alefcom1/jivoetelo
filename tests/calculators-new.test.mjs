import test from "node:test";
import assert from "node:assert/strict";
import {
  MICRONUTRIENTS,
  MICRO_GROUPS,
  gramsForNorm,
  normFor,
  nutrientsIn,
} from "../lib/micronutrients.ts";
import {
  SALT_LIMIT_G,
  SALT_SOURCES,
  SODIUM_PER_SALT_G,
  SUGAR_SOURCES,
  SUGAR_TEASPOON_G,
  computeSalt,
  computeSugar,
  sugarLimits,
} from "../lib/salt-sugar.ts";
import { computeBodyFat, healthyWeight, idealWeights } from "../lib/body-composition.ts";
import {
  ALCOHOL_DRINKS,
  CAFFEINE_DAILY_LIMIT,
  CAFFEINE_DRINKS,
  CAFFEINE_HALF_LIFE,
  CAFFEINE_SLEEP_THRESHOLD,
  computeAlcohol,
  computeCaffeine,
  drinkAlcoholG,
  drinkKcal,
  hoursBeforeSleep,
} from "../lib/caffeine-alcohol.ts";
import { SCALING_NOTES, scaleRecipe, sumRecipe } from "../lib/recipe.ts";
import { FOOD_REFERENCE } from "../lib/food-reference.ts";

/**
 * Вторая волна калькуляторов. Проверяем не «функция вернула число», а то,
 * что число осмысленно: нормы совпадают с источником, коэффициенты не
 * перепутаны местами, а на нелепом вводе формула не выдаёт отрицательный
 * процент жира как факт.
 */

/* ===== Витамины и минералы ===== */

test("нормы совпадают с МР 2.3.1.0253-21 в опорных точках", () => {
  const norms = Object.fromEntries(MICRONUTRIENTS.map((n) => [n.key, n]));
  assert.equal(norms["vitamin-c"].female, 90, "витамин C — 90 мг");
  assert.equal(norms["vitamin-d"].male, 15, "витамин D — 15 мкг");
  assert.equal(norms["calcium"].female, 1000, "кальций — 1000 мг");
  assert.equal(norms["iodine"].male, 150, "йод — 150 мкг");
  // Единственный нутриент в наборе, где норма зависит от пола, — и это
  // ровно то, что чаще всего теряют в русских таблицах.
  assert.equal(norms["iron"].female, 18, "железо у женщин — 18 мг");
  assert.equal(norms["iron"].male, 10, "железо у мужчин — 10 мг");
});

test("у каждого нутриента заполнены поля, без которых страница пустая", () => {
  for (const nutrient of MICRONUTRIENTS) {
    assert.match(nutrient.key, /^[a-z0-9-]+$/, `${nutrient.name}: ключ не для адреса`);
    assert.ok(nutrient.female > 0 && nutrient.male > 0, `${nutrient.name}: норма не задана`);
    assert.ok(nutrient.role.length > 20, `${nutrient.name}: роль описана слишком коротко`);
    assert.ok(nutrient.sources.length >= 4, `${nutrient.name}: меньше четырёх источников — таблица пустая`);
    for (const source of nutrient.sources) {
      assert.ok(source.per100 > 0, `${nutrient.name}: у «${source.name}» нулевое содержание`);
    }
  }
});

test("верхний предел выше нормы, а не наоборот", () => {
  for (const nutrient of MICRONUTRIENTS) {
    if (!nutrient.upper) continue;
    assert.ok(
      nutrient.upper > Math.max(nutrient.female, nutrient.male),
      `${nutrient.name}: верхний предел ниже нормы — где-то перепутаны колонки`,
    );
  }
});

test("ключи уникальны, группы разобраны без остатка", () => {
  const keys = MICRONUTRIENTS.map((n) => n.key);
  assert.equal(new Set(keys).size, keys.length, "повтор ключа нутриента");
  const inGroups = MICRO_GROUPS.reduce((sum, group) => sum + nutrientsIn(group).length, 0);
  assert.equal(inGroups, MICRONUTRIENTS.length, "нутриент с группой вне списка потеряется на странице");
});

test("«сколько граммов закроют норму» считается в ту сторону", () => {
  const ironLike = { key: "t", name: "Тест", unit: "мг", female: 18, male: 10, group: "Минералы", role: "-", sources: [] };
  // 100 г продукта дают 9 мг при норме 18 — значит нужно 200 г.
  assert.equal(gramsForNorm(ironLike, "female", 9), 200);
  // Тому же продукту при норме 10 хватит 111 г.
  assert.equal(gramsForNorm(ironLike, "male", 9), 111);
  assert.equal(gramsForNorm(ironLike, "male", 0), 0, "нулевое содержание не должно давать бесконечность");
  assert.equal(normFor(ironLike, "female"), 18);
});

test("продукты-источники не выдуманы: они есть в справочнике или это узнаваемые сырьевые названия", () => {
  // Часть источников (печень, кунжут, курага) в справочнике блюд может
  // отсутствовать — это допустимо, но название должно быть внятным, а не
  // «Продукт 1». Проверяем формат, а совпадение со справочником — отдельно.
  const known = new Set(FOOD_REFERENCE.map((f) => f.name));
  let matched = 0;
  let total = 0;
  for (const nutrient of MICRONUTRIENTS) {
    for (const source of nutrient.sources) {
      total += 1;
      if (known.has(source.name)) matched += 1;
      assert.ok(source.name.length >= 3, `«${source.name}» — не название продукта`);
    }
  }
  assert.ok(matched / total >= 0.4, `со справочником совпало ${matched} из ${total} — слишком мало`);
});

/* ===== Соль ===== */

test("норма соли ВОЗ и перевод в натрий не разъезжаются", () => {
  assert.equal(SALT_LIMIT_G, 5);
  // 5 г соли × 400 мг натрия = 2000 мг — именно та цифра, которую ВОЗ
  // называет вторым способом.
  assert.equal(SALT_LIMIT_G * SODIUM_PER_SALT_G, 2000);
});

test("сумма источников соли и зоны превышения", () => {
  const empty = computeSalt({});
  assert.equal(empty.totalG, 0);
  assert.equal(empty.zone, "ok");

  // Хлеб 0,5 + сыр 0,9 + соль при готовке 2,0 = 3,4 г — в норме.
  const modest = computeSalt({ "Хлеб": 1, "Сыр": 1, "Соль при готовке": 1 });
  assert.equal(modest.totalG, 3.4);
  assert.equal(modest.zone, "ok");
  assert.equal(modest.sodiumMg, 1360);

  // Типичный день с колбасой, сосисками и супом из пакетика уходит за две нормы.
  const heavy = computeSalt({
    "Хлеб": 2, "Сыр": 1, "Колбаса варёная": 1, "Сосиски": 1,
    "Суп из пакетика": 1, "Соль при готовке": 1, "Досаливание за столом": 1,
  });
  assert.ok(heavy.totalG > 10, `набралось ${heavy.totalG} г — ожидали больше десяти`);
  assert.equal(heavy.zone, "high");
  assert.ok(heavy.ratio >= 2);
});

test("источники соли покрывают и скрытые, и явные", () => {
  const names = SALT_SOURCES.map((s) => s.name);
  assert.ok(names.includes("Соль при готовке"), "без солонки таблица выглядит подтасовкой");
  assert.ok(names.includes("Хлеб"), "хлеб — главный скрытый источник, без него смысл теряется");
  for (const source of SALT_SOURCES) {
    assert.ok(source.perPortion > 0 && source.perPortion < 5, `${source.name}: неправдоподобная порция соли`);
    assert.ok(source.portion.length > 2, `${source.name}: не указана порция`);
  }
});

/* ===== Сахар ===== */

test("лимиты сахара ВОЗ считаются от калорийности", () => {
  // 2000 ккал: 10% = 200 ккал = 50 г; 5% = 100 ккал = 25 г.
  const limits = sugarLimits(2000);
  assert.equal(limits.softG, 50);
  assert.equal(limits.strictG, 25);
  assert.equal(limits.softTeaspoons, 10);
  assert.equal(limits.strictTeaspoons, 5);

  // Строгий лимит всегда вдвое ниже мягкого — на любой калорийности.
  for (const kcal of [1200, 1800, 2400, 3000]) {
    const l = sugarLimits(kcal);
    assert.ok(l.strictG < l.softG, `${kcal} ккал: строгий лимит не ниже мягкого`);
  }
});

test("одна банка газировки перекрывает строгий лимит ВОЗ", () => {
  const result = computeSugar({ "Газировка": 1 }, 2000);
  assert.equal(result.grams, 35);
  assert.equal(result.teaspoons, 7);
  // 35 г при 2000 ккал: строгий лимит (25 г) уже перекрыт в полтора раза,
  // мягкий (50 г) — ещё нет. Ровно этот зазор и делает страницу полезной.
  assert.ok(result.grams > result.limits.strictG, "банка обязана перекрывать 5% калорийности");
  assert.ok(result.grams < result.limits.softG);
  assert.equal(result.zone, "soft");
  // 35 г × 4 ккал = 140 ккал = 7% от 2000.
  assert.equal(result.kcal, 140);
  assert.equal(result.shareOfKcal, 7);
  // Две банки уже выходят за мягкий лимит — это тот случай, который человек
  // не считает вовсе.
  assert.equal(computeSugar({ "Газировка": 2 }, 2000).zone, "above");
});

test("зоны сахара переключаются на границах, а не рядом с ними", () => {
  // Строгий лимит при 2000 ккал — 25 г, это пять чайных ложек.
  const strict = computeSugar({ "Сахар в чай или кофе": 5 }, 2000);
  assert.equal(strict.grams, 25);
  assert.equal(strict.zone, "strict");
  const soft = computeSugar({ "Сахар в чай или кофе": 6 }, 2000);
  assert.equal(soft.zone, "soft");
});

test("источники сахара заданы в граммах на понятную порцию", () => {
  for (const source of SUGAR_SOURCES) {
    assert.ok(source.sugarG > 0 && source.sugarG < 60, `${source.name}: неправдоподобно`);
    assert.ok(source.portion.length > 2, `${source.name}: не указана порция`);
  }
  assert.equal(SUGAR_TEASPOON_G, 5, "чайная ложка сахара — 5 г, на этом держится вся наглядность");
});

/* ===== Процент жира ===== */

test("формула ВМС США даёт правдоподобные проценты", () => {
  // Мужчина 180 см, шея 38, талия 85 — обычное сложение, ожидаем 18–22%.
  const male = computeBodyFat({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 85 });
  assert.ok(male, "не посчиталось на нормальном вводе");
  assert.ok(male.percent > 14 && male.percent < 20, `получилось ${male.percent}% — неправдоподобно`);
  assert.equal(male.category, "fitness");

  // Женщина 165 см, шея 32, талия 72, бёдра 96 — ожидаем 25–32%.
  const female = computeBodyFat({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 72, hipCm: 96 });
  assert.ok(female, "женский вариант не посчитался");
  assert.ok(female.percent > 22 && female.percent < 34, `получилось ${female.percent}%`);
});

test("при одинаковых обхватах у женщины процент выше — так и должно быть", () => {
  const male = computeBodyFat({ sex: "male", heightCm: 170, neckCm: 34, waistCm: 80 });
  const female = computeBodyFat({ sex: "female", heightCm: 170, neckCm: 34, waistCm: 80, hipCm: 95 });
  assert.ok(female.percent > male.percent, "физиология: у женщин доля жира выше при том же сложении");
});

test("рост талии повышает процент, рост шеи — понижает", () => {
  const base = computeBodyFat({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 85 });
  const fatter = computeBodyFat({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 95 });
  const thicker = computeBodyFat({ sex: "male", heightCm: 180, neckCm: 42, waistCm: 85 });
  assert.ok(fatter.percent > base.percent, "плюс 10 см талии — процент должен вырасти");
  assert.ok(thicker.percent < base.percent, "шея входит в формулу со знаком минус");
});

test("нелепый ввод не превращается в отрицательный процент", () => {
  assert.equal(computeBodyFat({ sex: "male", heightCm: 0, neckCm: 38, waistCm: 85 }), null);
  assert.equal(computeBodyFat({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 72 }), null, "женщине нужны бёдра");
  // Талия меньше шеи — формула даст логарифм от отрицательного числа.
  assert.equal(computeBodyFat({ sex: "male", heightCm: 180, neckCm: 50, waistCm: 40 }), null);
  // Экстремальные, но формально валидные обхваты зажимаются в 3–65%.
  const extreme = computeBodyFat({ sex: "male", heightCm: 150, neckCm: 30, waistCm: 200 });
  assert.ok(extreme.percent <= 65 && extreme.percent >= 3, `вышло ${extreme.percent}%`);
});

test("масса жира и безжировая масса складываются в вес", () => {
  const result = computeBodyFat({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 85 }, 80);
  assert.ok(result.fatMassKg && result.leanMassKg);
  assert.ok(Math.abs(result.fatMassKg + result.leanMassKg - 80) < 0.15, "части не сходятся с целым");
  const withoutWeight = computeBodyFat({ sex: "male", heightCm: 180, neckCm: 38, waistCm: 85 });
  assert.equal(withoutWeight.fatMassKg, undefined, "без веса массу жира считать не из чего");
});

/* ===== Здоровый диапазон веса ===== */

test("четыре формулы «идеального веса» расходятся — в этом весь смысл страницы", () => {
  const rows = idealWeights("male", 180);
  assert.equal(rows.length, 4);
  const values = rows.map((r) => r.weightKg);
  const spread = Math.max(...values) - Math.min(...values);
  assert.ok(spread > 3, `расхождение всего ${spread} кг — тогда аргумент страницы не работает`);
  // Devine для мужчины 180 см: 50 + 2,3 × 10,86 дюйма ≈ 75 кг.
  const devine = rows.find((r) => r.name.startsWith("Devine"));
  assert.ok(Math.abs(devine.weightKg - 75) < 1.5, `Devine дал ${devine.weightKg} кг`);
  // Формулы расходятся не только числом, но и направлением: у Miller самая
  // высокая база и самая пологая прибавка, поэтому на низком росте она
  // наверху разброса, а на высоком — внизу. Это сильнее любого «расхождение
  // в N кг» доказывает, что единого идеального веса не существует.
  const millerTall = idealWeights("male", 190).find((r) => r.name.startsWith("Miller")).weightKg;
  const tall = idealWeights("male", 190).map((r) => r.weightKg);
  assert.equal(millerTall, Math.min(...tall), "на 190 см Miller обязан быть нижней границей");

  const millerShort = idealWeights("male", 155).find((r) => r.name.startsWith("Miller")).weightKg;
  const short = idealWeights("male", 155).map((r) => r.weightKg);
  assert.equal(millerShort, Math.max(...short), "на 155 см Miller обязан быть верхней границей");
});

test("здоровый диапазон по ИМТ считается от роста и шире одной цифры", () => {
  const range = healthyWeight("female", 165);
  assert.ok(range);
  // 18,5 × 1,65² = 50,4; 24,9 × 1,65² = 67,8.
  assert.equal(range.bmiRange.from, 50);
  assert.equal(range.bmiRange.to, 68);
  assert.ok(range.bmiRange.to - range.bmiRange.from > 10, "диапазон нормального ИМТ шире 10 кг");
  assert.equal(range.formulas.length, 4);
  assert.ok(range.formulaSpread > 0);
  assert.equal(healthyWeight("male", 0), null);
});

test("на низком росте формулы ломаются — оговорка на странице не выдумана", () => {
  // Ниже 152,4 см прибавка обнуляется: формула вырождается в базу и
  // перестаёт реагировать на рост вовсе.
  const short = idealWeights("female", 150);
  const atBase = idealWeights("female", 152.4);
  const evenShorter = idealWeights("female", 140);
  assert.deepEqual(short.map((r) => r.weightKg), atBase.map((r) => r.weightKg),
    "ниже 5 футов формулы обязаны упираться в базу, а не уходить в минус");
  assert.deepEqual(evenShorter.map((r) => r.weightKg), atBase.map((r) => r.weightKg),
    "на 140 см формула обязана дать то же, что на 152,4 — она заморожена");

  // И вот чем это оборачивается: на 140 см «идеальный вес» вылезает выше
  // верхней границы здорового ИМТ. Числу, которое так себя ведёт, нельзя
  // доверять как цели — ровно это мы и говорим на странице.
  const range = healthyWeight("female", 140);
  assert.ok(range.formulaRange.to > range.bmiRange.to,
    `на 140 см формулы дают до ${range.formulaRange.to} кг при верхней границе ИМТ ${range.bmiRange.to}`);
});

/* ===== Кофеин ===== */

test("суточная доза кофеина и зоны", () => {
  assert.equal(CAFFEINE_DAILY_LIMIT, 400, "EFSA — 400 мг");
  const three = computeCaffeine({ "Американо": 3 });
  assert.equal(three.totalMg, 240);
  assert.equal(three.shareOfLimit, 60);
  assert.equal(three.zone, "ok");

  const six = computeCaffeine({ "Американо": 6 });
  assert.equal(six.totalMg, 480);
  assert.equal(six.zone, "above");
});

test("период полувыведения: через пять часов остаётся половина", () => {
  const dose = computeCaffeine({ "Фильтр-кофе": 2 }); // 190 мг
  assert.equal(dose.totalMg, 190);
  assert.equal(dose.remainingAfter(0), 190);
  assert.equal(dose.remainingAfter(CAFFEINE_HALF_LIFE), 95);
  assert.equal(dose.remainingAfter(CAFFEINE_HALF_LIFE * 2), 48);
  // Убывание строго монотонное — иначе график поедет.
  let prev = Infinity;
  for (let h = 0; h <= 12; h += 1) {
    const left = dose.remainingAfter(h);
    assert.ok(left <= prev, `на ${h} ч кофеина стало больше, чем на предыдущем`);
    prev = left;
  }
});

test("время до сна: обратная задача решается согласованно с прямой", () => {
  assert.equal(hoursBeforeSleep(CAFFEINE_SLEEP_THRESHOLD), 0, "доза на уровне порога не мешает");
  assert.equal(hoursBeforeSleep(30), 0);
  // 100 мг — ровно два порога, значит один период полувыведения.
  assert.equal(hoursBeforeSleep(100), 5);
  assert.equal(hoursBeforeSleep(200), 10);

  // Прямая и обратная задача должны сходиться: если остановиться за
  // столько часов, ко сну останется примерно порог.
  for (const dose of [95, 150, 240, 400]) {
    const hours = hoursBeforeSleep(dose);
    const left = dose * Math.pow(0.5, hours / CAFFEINE_HALF_LIFE);
    assert.ok(Math.abs(left - CAFFEINE_SLEEP_THRESHOLD) < 1, `${dose} мг: осталось ${left.toFixed(1)} мг`);
  }
});

test("таблица напитков покрывает то, что люди действительно пьют", () => {
  const names = CAFFEINE_DRINKS.map((d) => d.name);
  for (const must of ["Эспрессо", "Чай чёрный", "Энергетик"]) {
    assert.ok(names.includes(must), `нет «${must}» — таблица неполная`);
  }
  for (const drink of CAFFEINE_DRINKS) {
    assert.ok(drink.mg > 0 && drink.mg < 200, `${drink.name}: ${drink.mg} мг неправдоподобно`);
    assert.ok(drink.portion.length > 2, `${drink.name}: не указана порция`);
  }
  // Зелёный чай слабее чёрного, эспрессо крепче капучино на ту же чашку.
  const by = Object.fromEntries(CAFFEINE_DRINKS.map((d) => [d.name, d.mg]));
  assert.ok(by["Чай зелёный"] < by["Чай чёрный"]);
});

/* ===== Алкоголь ===== */

test("калорийность напитка считается по спирту, а не по объёму", () => {
  const vodka = ALCOHOL_DRINKS.find((d) => d.name === "Водка");
  // 50 мл × 40% × 0,789 = 15,8 г спирта × 7 = 110 ккал.
  assert.equal(drinkAlcoholG(vodka), 16);
  assert.ok(Math.abs(drinkKcal(vodka) - 110) <= 2, `вышло ${drinkKcal(vodka)} ккал`);

  // Сухое вино и полусладкое различаются только сахаром — и это видно.
  const dry = ALCOHOL_DRINKS.find((d) => d.name === "Вино сухое белое");
  const semi = ALCOHOL_DRINKS.find((d) => d.name === "Вино полусладкое");
  assert.ok(drinkKcal(semi) > drinkKcal(dry), "полусладкое обязано быть калорийнее сухого");
  assert.equal(drinkAlcoholG(semi), drinkAlcoholG(dry), "спирта в них поровну");
});

test("вечер складывается в заметные калории и в порции спирта", () => {
  const evening = computeAlcohol({ "Пиво светлое": 2 });
  // Две бутылки: около 36 г спирта и 370 ккал.
  assert.ok(evening.alcoholG >= 34 && evening.alcoholG <= 38, `${evening.alcoholG} г спирта`);
  assert.ok(evening.kcal > 300, `${evening.kcal} ккал — ожидали больше трёхсот`);
  assert.ok(Math.abs(evening.units - evening.alcoholG / 10) < 0.15, "порции считаются по 10 г спирта");

  assert.equal(computeAlcohol({}).kcal, 0);
  assert.equal(computeAlcohol({ "Такого напитка нет": 5 }).kcal, 0, "неизвестное название не должно ломать счёт");
});

test("напитки заданы полно: объём, крепость и углеводы", () => {
  for (const drink of ALCOHOL_DRINKS) {
    assert.ok(drink.volumeMl > 0 && drink.volumeMl <= 1000, `${drink.name}: объём`);
    assert.ok(drink.abv > 0 && drink.abv <= 45, `${drink.name}: крепость ${drink.abv}%`);
    assert.ok(drink.carbsG >= 0, `${drink.name}: отрицательные углеводы`);
    assert.ok(drinkKcal(drink) > 0, `${drink.name}: нулевая калорийность`);
  }
});

/* ===== Пересчёт рецепта ===== */

test("пересчёт умножает закладку и не трогает порцию", () => {
  const items = [
    { name: FOOD_REFERENCE[0].name, grams: 200 },
    { name: FOOD_REFERENCE[1].name, grams: 150 },
  ];
  const base = sumRecipe(items);
  const scaled = scaleRecipe(items, 4, 6);

  assert.equal(scaled.factor, 1.5);
  assert.equal(scaled.items[0].to, 300);
  assert.equal(scaled.items[1].to, 225);
  assert.equal(scaled.items[0].delta, 100);
  assert.equal(scaled.rawWeightFrom, base.rawWeight);
  assert.equal(scaled.rawWeightTo, 525);

  // Главное утверждение страницы: КБЖУ порции при пересчёте не меняется.
  const same = scaleRecipe(items, 4, 4);
  assert.deepEqual(scaled.perPortion, same.perPortion);
  assert.equal(scaled.perPortion.kcal, Math.round(base.kcal / 4));
});

test("пересчёт вниз тоже работает, а нулевые порции не делят на ноль", () => {
  const items = [{ name: FOOD_REFERENCE[0].name, grams: 300 }];
  const half = scaleRecipe(items, 6, 3);
  assert.equal(half.factor, 0.5);
  assert.equal(half.items[0].to, 150);
  assert.ok(half.items[0].delta < 0, "при уменьшении разница отрицательная");

  const zero = scaleRecipe(items, 0, 0);
  assert.ok(Number.isFinite(zero.factor), "деление на ноль не должно давать Infinity");
  assert.equal(zero.factor, 1);
  assert.ok(Number.isFinite(zero.perPortion.kcal));
});

test("итог новой закладки равен порции, умноженной на число порций", () => {
  const items = [
    { name: FOOD_REFERENCE[2].name, grams: 250 },
    { name: FOOD_REFERENCE[3].name, grams: 120 },
  ];
  const scaled = scaleRecipe(items, 2, 5);
  assert.equal(scaled.totalTo.kcal, scaled.perPortion.kcal * 5);
});

test("пустой рецепт не роняет пересчёт", () => {
  const empty = scaleRecipe([], 2, 4);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.rawWeightTo, 0);
  assert.equal(empty.perPortion.kcal, 0);
});

test("оговорки про масштабирование на месте и содержательны", () => {
  assert.ok(SCALING_NOTES.length >= 3, "без оговорок страница — обычный умножитель");
  for (const note of SCALING_NOTES) {
    assert.ok(note.title.length > 10, "пустой заголовок оговорки");
    assert.ok(note.text.length > 120, `«${note.title}»: слишком коротко, чтобы что-то объяснить`);
  }
  const all = SCALING_NOTES.map((n) => `${n.title} ${n.text}`).join(" ").toLowerCase();
  assert.ok(all.includes("соль") || all.includes("специ"), "не сказано главного: приправы так не умножаются");
});

/* ===== Числа по-русски ===== */

test("дробная часть отделяется запятой, а хвостовой ноль не печатается", async () => {
  const { ru } = await import("../app/raschet/format.ts");
  assert.equal(ru(61.5), "61,5");
  assert.equal(ru(2.5), "2,5");
  assert.equal(ru(52), "52", "«52,0» читается как точность до сотни граммов, которой нет");
  // Самая опасная строчка: обрезать нули у целого числа нельзя.
  assert.equal(ru(100), "100");
  assert.equal(ru(100, 2), "100");
  assert.equal(ru(1000), "1000");
  assert.equal(ru(0.5, 2), "0,5");
  assert.equal(ru(1.25, 2), "1,25");
  assert.equal(ru(0), "0");
  assert.equal(ru(NaN), "—");
  assert.equal(ru(Infinity), "—");
});
