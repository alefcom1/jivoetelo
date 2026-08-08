import test from "node:test";
import assert from "node:assert/strict";
import {
  atwaterAgrees,
  cleanName,
  formatReport,
  normalizeSearchKey,
  parseAll,
  parseNumber,
  parseRow,
} from "../lib/catalog-import.ts";
import { attributionList, CATALOG_SOURCES, isCatalogSource, sourceRank } from "../lib/catalog-sources.ts";

const COLUMNS = { name: "Продукт", kcal: "Ккал", protein: "Белки", fat: "Жиры", carbs: "Углеводы", fiber: "Клетчатка" };

function row(over = {}) {
  return { Продукт: "Гречка отварная", Ккал: "110", Белки: "4,2", Жиры: "1,1", Углеводы: "21,3", Клетчатка: "2,7", ...over };
}

// ─── Разбор чисел ──────────────────────────────────────────────────────────

test("числа читаются в тех видах, в каких их пишут источники", () => {
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("12.5"), 12.5);
  assert.equal(parseNumber("12,5 г"), 12.5);
  assert.equal(parseNumber("1 234"), 1234);
  assert.equal(parseNumber(42), 42);
});

test("отсутствие числа отличается от нуля", () => {
  // Ноль белка — факт, пустая клетка — незнание. Слить их значило бы
  // объявить, что в неразобранном продукте белка нет.
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("—"), null);
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber(undefined), null);
  assert.equal(parseNumber("0"), 0);
});

// ─── Имена ─────────────────────────────────────────────────────────────────

test("из имени убираются хвосты про сто грамм и лишние пробелы", () => {
  assert.equal(cleanName("  Творог   5%  "), "Творог 5%");
  assert.equal(cleanName("Гречка отварная (на 100 г)"), "Гречка отварная");
  assert.equal(cleanName("Овсянка (100 г)"), "Овсянка");
  assert.equal(cleanName("Кефир 1%,"), "Кефир 1%");
});

test("ключ поиска сводит ё к е — ищут как придётся", () => {
  assert.equal(normalizeSearchKey("Гречнёвая каша"), normalizeSearchKey("Гречневая каша"));
  assert.equal(normalizeSearchKey("Творог 5%"), "творог 5");
});

// ─── Атуотер ───────────────────────────────────────────────────────────────

test("верные числа проходят проверку по Атуотеру", () => {
  assert.ok(atwaterAgrees({ kcalPer100: 110, proteinPer100: 4.2, fatPer100: 1.1, carbsPer100: 21.3, fiberPer100: 2.7 }));
  assert.ok(atwaterAgrees({ kcalPer100: 165, proteinPer100: 31, fatPer100: 3.6, carbsPer100: 0, fiberPer100: 0 }));
});

test("опечатка в разряде не проходит — ради этого проверка и заведена", () => {
  // 170 г белка вместо 17: самая вероятная ошибка в таблице чисел.
  assert.equal(
    atwaterAgrees({ kcalPer100: 100, proteinPer100: 170, fatPer100: 1, carbsPer100: 2, fiberPer100: 0 }),
    false,
  );
});

test("почти нулевые по калорийности через отношение не проверяются", () => {
  // У чая и специй числитель и знаменатель — шум; строгая проверка
  // выбраковывала бы верные строки.
  assert.ok(atwaterAgrees({ kcalPer100: 1, proteinPer100: 0, fatPer100: 0, carbsPer100: 0.2, fiberPer100: 0 }));
});

// ─── Разбор строки ─────────────────────────────────────────────────────────

test("нормальная строка разбирается и помечается пригодной", () => {
  const outcome = parseRow(row(), COLUMNS, "health-diet");
  assert.ok(outcome.ok);
  assert.equal(outcome.row.name, "Гречка отварная");
  assert.equal(outcome.row.kcalPer100, 110);
  assert.equal(outcome.row.proteinPer100, 4.2);
  assert.equal(outcome.row.verified, true);
  assert.equal(outcome.atwaterOff, false);
});

test("без имени и без калорийности строка отбрасывается", () => {
  assert.deepEqual(parseRow(row({ Продукт: "  " }), COLUMNS, "health-diet"), { ok: false, reason: "no-name", name: "" });
  const noKcal = parseRow(row({ Ккал: "" }), COLUMNS, "health-diet");
  assert.equal(noKcal.ok, false);
  assert.equal(noKcal.reason, "no-kcal");
});

test("отрицательные значения и невозможная масса отбрасываются", () => {
  const negative = parseRow(row({ Белки: "-5" }), COLUMNS, "health-diet");
  assert.equal(negative.reason, "negative");
  // В ста граммах продукта не может быть 60+50+30 граммов вещества.
  const impossible = parseRow(row({ Белки: "60", Жиры: "50", Углеводы: "30" }), COLUMNS, "health-diet");
  assert.equal(impossible.reason, "impossible-mass");
});

test("клетчатка не может превышать углеводы — источники это путают", () => {
  const outcome = parseRow(row({ Углеводы: "5", Клетчатка: "20" }), COLUMNS, "health-diet");
  assert.ok(outcome.ok);
  assert.equal(outcome.row.fiberPer100, 5, "клетчатка обрезается до углеводов");
});

test("строка с расхождением по Атуотеру сохраняется, но в поиск не пойдёт", () => {
  const outcome = parseRow(row({ Ккал: "700" }), COLUMNS, "health-diet");
  assert.ok(outcome.ok, "строка не выбрасывается");
  assert.equal(outcome.row.verified, false, "но помечена непригодной");
  assert.equal(outcome.atwaterOff, true);
});

// ─── Разбор файла ──────────────────────────────────────────────────────────

test("дубли внутри файла отсеиваются — иначе упадёт уникальный индекс", () => {
  const { rows, report } = parseAll([row(), row(), row()], COLUMNS, "health-diet");
  assert.equal(rows.length, 1);
  assert.equal(report.duplicatesInFile, 2);
  assert.equal(report.total, 3);
});

test("совпадения с выверенным справочником считаются, но не выбрасываются", () => {
  // «Гречка отварная» есть и у нас: сливать молча нельзя (у них она может
  // быть сухой), но и терять позицию незачем — решает человек.
  const referenceKeys = new Set([normalizeSearchKey("Гречка отварная")]);
  const { rows, report } = parseAll([row()], COLUMNS, "health-diet", referenceKeys);
  assert.equal(rows.length, 1, "строка остаётся");
  assert.equal(report.duplicatesWithReference, 1, "но помечена как совпадение");
});

test("отчёт считает принятое и отброшенное без потерь", () => {
  const rows = [row(), row({ Продукт: "Овсянка", Ккал: "" }), row({ Продукт: "Кефир", Ккал: "56", Белки: "3", Жиры: "1", Углеводы: "4", Клетчатка: "0" })];
  const { rows: parsed, report } = parseAll(rows, COLUMNS, "health-diet");
  assert.equal(report.total, 3);
  assert.equal(report.accepted, parsed.length);
  assert.equal(report.accepted + (report.total - report.accepted), 3);
  assert.equal(report.rejected["no-kcal"], 1);
});

test("отчёт печатается с примерами расхождений", () => {
  const { report } = parseAll([row({ Ккал: "700" })], COLUMNS, "health-diet");
  const text = formatReport(report, "тест");
  assert.match(text, /Атуотер/i);
  assert.match(text, /Гречка отварная/);
});

// ─── Источники и атрибуция ─────────────────────────────────────────────────

test("у каждого источника есть подпись для интерфейса", () => {
  // Атрибуция — условие использования данных, а не украшение. Источник без
  // подписи означал бы, что где-то на экране числа появятся безымянными.
  for (const [key, source] of Object.entries(CATALOG_SOURCES)) {
    assert.equal(source.key, key);
    assert.ok(source.label.length > 0, `${key}: пустая подпись`);
    assert.ok(source.full.length > 0, `${key}: нет полного названия`);
  }
});

test("таблицы ФИЦ названы первоисточником и стоят выше прочего импорта", () => {
  assert.match(CATALOG_SOURCES["fic-tables"].full, /Скурихин/);
  assert.match(CATALOG_SOURCES["fic-tables"].full, /ФИЦ питания/);
  assert.ok(sourceRank("fic-tables") < sourceRank("health-diet"));
  assert.ok(sourceRank("fic-tables") < sourceRank("calculat"));
  assert.ok(sourceRank("fic-tables") < sourceRank("dietagram"));
});

test("правки людей старше любого импорта", () => {
  for (const key of ["fic-tables", "health-diet", "calculat", "dietagram"]) {
    assert.ok(sourceRank("user") < sourceRank(key), `правки должны быть выше ${key}`);
  }
});

test("список атрибуции не включает наши собственные правки", () => {
  const list = attributionList();
  assert.ok(list.length >= 4);
  assert.ok(!list.some((line) => /Живого Тела/.test(line)));
  assert.ok(list.some((line) => /Скурихин/.test(line)));
});

test("неизвестный источник опознаётся как неизвестный", () => {
  assert.equal(isCatalogSource("health-diet"), true);
  assert.equal(isCatalogSource("выдуманное"), false);
  assert.equal(sourceRank("выдуманное"), 99, "неизвестный источник уходит в конец выдачи");
});
