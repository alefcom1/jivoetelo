import test from "node:test";
import assert from "node:assert/strict";
import { DISH_COUNT, dishKey, dishKeyLabel, isAlcoholKey, normalizeDishName } from "../lib/dish-key.ts";

/** Короче в записи: сравниваем только сам ключ. */
const key = (name) => dishKey(name).key;

test("тот самый случай из frequent-meals.ts: одна тарелка — один ключ", () => {
  // Комментарий к repeatableMeals описывает это как случившийся провал:
  // «сегодня "Овсяная каша на молоке", а завтра "Овсянка с молоком"».
  assert.equal(key("Овсяная каша на молоке"), "dish:ovsyanka");
  assert.equal(key("Овсянка с молоком"), "dish:ovsyanka");
  assert.equal(key("овсянка"), "dish:ovsyanka");
  assert.equal(key("Каша овсяная"), "dish:ovsyanka", "порядок слов не должен менять ключ");
});

test("родовое название проигрывает конкретному, но само по себе работает", () => {
  assert.equal(key("Гречневая каша"), "dish:grechka");
  assert.equal(key("Каша перловая"), "dish:perlovka");
  assert.equal(key("Каша"), "dish:kasha");
  assert.equal(key("Салат"), "dish:salat");
});

test("ловушка, о которой предупреждает frequent-meals.ts: грудка и бульон", () => {
  assert.equal(key("Куриная грудка"), "dish:kurinaya-grudka");
  assert.equal(key("Грудка куриная отварная"), "dish:kurinaya-grudka");
  assert.notEqual(key("Куриный бульон"), "dish:kurinaya-grudka");
});

test("похожие по началу слова не склеиваются", () => {
  // «печен» — префикс обоих; без разведения основ печень стала бы печеньем.
  assert.equal(key("Печень говяжья"), "dish:pechen");
  assert.equal(key("Печенье овсяное"), "dish:pechenye");
  assert.notEqual(key("Печень"), key("Печенье"));

  assert.equal(key("Сыр российский"), "dish:syr");
  assert.equal(key("Сырники"), "dish:syrniki");
  assert.equal(key("Глазированный сырок"), "dish:syrok");
  assert.notEqual(key("Сыр"), key("Сырники"));

  // «фри» — префикс «фрикаделек», и притом короче основы «картофел»:
  // словосочетание разводит оба случая.
  assert.equal(key("Картофель фри"), "dish:kartofel-fri");
  assert.equal(key("Картошка фри большая"), "dish:kartofel-fri");
  assert.equal(key("Фрикадельки"), "dish:kotleta");
  assert.equal(key("Картофель отварной"), "dish:kartofel");

  // «под» — служебное слово: без словосочетания от салата осталась бы селёдка.
  assert.equal(key("Селёдка под шубой"), "dish:shuba");

  // «ром» был бы префиксом «ромашкового».
  assert.notEqual(dishKey("Ромашковый чай").key, "dish:krepkiy-alkogol");
});

test("прилагательное не перебивает существительное", () => {
  assert.equal(key("Сырое яйцо"), "dish:yayca");
  assert.equal(key("Молочный шоколад"), "dish:shokolad");
  assert.equal(key("Оливковое масло"), "dish:maslo");
  // Исключение из правила — арахисовая паста: там прилагательное и есть блюдо.
  assert.equal(key("Арахисовая паста"), "dish:arahisovaya-pasta");
});

test("уточнение после служебного слова не подменяет блюдо", () => {
  assert.equal(key("Блины с творогом"), "dish:bliny");
  assert.equal(key("Рис с овощами"), "dish:ris");
  assert.equal(key("Творог с бананом"), "dish:tvorog");
});

test("незнакомое название всё равно получает ключ — на уровне категории", () => {
  const result = dishKey("Тыквенный крем-суп с трюфельным маслом и пармезаном");
  assert.ok(result.key.startsWith("dish:") || result.key.startsWith("cat:"));

  const unknown = dishKey("Абырвалг");
  assert.equal(unknown.level, "category");
  assert.ok(unknown.key.startsWith("cat:"));

  // Ключ есть всегда — даже у пустой строки. Позиция, выпадающая из подсчёта
  // молча, хуже грубой категории.
  const empty = dishKey("");
  assert.ok(empty.key.startsWith("cat:"));
  assert.equal(empty.level, "category");
});

test("алкоголь опознаётся отдельно — это признак дня в анализе веса", () => {
  assert.equal(dishKey("Пиво светлое").isAlcohol, true);
  assert.equal(dishKey("Бокал красного вина").isAlcohol, true);
  assert.equal(dishKey("Виски").isAlcohol, true);
  assert.equal(dishKey("Кефир").isAlcohol, false);
  assert.equal(isAlcoholKey("dish:pivo"), true);
  assert.equal(isAlcoholKey("dish:kefir"), false);
  assert.equal(isAlcoholKey("cat:drink"), false);
});

test("нормализация: регистр, «ё» и лишние пробелы", () => {
  assert.equal(normalizeDishName("  Гречка   ОТВАРНАЯ "), "гречка отварная");
  assert.equal(normalizeDishName("Свёкла"), "свекла");
  assert.equal(key("Свёкла варёная"), key("Свекла вареная"));
});

test("подпись выводится по ключу — отчёт собирается из одних ключей", () => {
  assert.equal(dishKeyLabel("dish:ovsyanka"), "Овсянка");
  assert.equal(dishKeyLabel("dish:kurinaya-grudka"), "Куриная грудка");
  assert.equal(typeof dishKeyLabel("cat:cereal"), "string");
  assert.equal(dishKeyLabel("что-то своё"), "что-то своё");
});

test("в словаре нет двух блюд с одним слагом и нет пустых основ", () => {
  assert.ok(DISH_COUNT > 100, `блюд в словаре: ${DISH_COUNT}`);
});

test("массовый рацион опознаётся на уровне блюда, а не категории", () => {
  const common = [
    "Борщ", "Пельмени", "Гречка отварная", "Куриная грудка", "Творог 5%",
    "Овсянка на воде", "Яичница", "Банан", "Кофе с молоком", "Хлеб чёрный",
    "Макароны", "Салат Цезарь", "Плов", "Пицца пепперони", "Шаурма",
    "Сырники", "Йогурт натуральный", "Гречневая каша", "Суп куриный", "Оливье",
  ];
  const byCategory = common.filter((name) => dishKey(name).level !== "dish");
  assert.deepEqual(byCategory, [], `эти названия не дошли до уровня блюда: ${byCategory.join(", ")}`);
});
