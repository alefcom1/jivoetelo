import test from "node:test";
import assert from "node:assert/strict";
import {
  barcodeFormat,
  barcodeRegion,
  formatBarcode,
  isStoreInternal,
  isValidBarcode,
  normalizeBarcode,
} from "../lib/barcode.ts";

// Настоящие коды с настоящих упаковок — контрольные цифры у них верные.
const MILK = "4600682003014"; // «Домик в деревне», Россия
const COKE = "5449000000996"; // Coca-Cola, Великобритания
const SHORT = "96385074"; // EAN-8 из примеров GS1
const UPC = "036000291452"; // UPC-A, 12 цифр

test("настоящие коды проходят проверку", () => {
  for (const code of [MILK, COKE, SHORT]) {
    assert.equal(isValidBarcode(code), true, `не принят ${code}`);
  }
});

test("одна изменённая цифра ломает контрольную сумму", () => {
  // Ровно тот случай, ради которого проверка и нужна: блик на плёнке, и
  // сканер отдаёт соседнюю цифру. Без проверки такой код ушёл бы в базу
  // новым товаром, который больше никогда не найдётся.
  assert.equal(isValidBarcode("4600682003015"), false);
  assert.equal(isValidBarcode("4600682003114"), false);
  assert.equal(isValidBarcode("5449000000995"), false);
});

test("перестановка соседних цифр с разницей 5 проходит — это свойство EAN", () => {
  // Транспозиция сдвигает сумму на удвоенную разницу цифр; при разнице 5
  // сдвиг ровно 10, и контрольная цифра остаётся прежней. Это свойство
  // самого стандарта, а не нашей реализации. Тест стоит здесь, чтобы
  // следующий читатель не пытался «починить» несуществующую ошибку — и
  // чтобы никто не считал контрольную цифру защитой от любой опечатки.
  assert.equal(isValidBarcode("0000000000055"), true);
  assert.equal(isValidBarcode("0000000000505"), true, "разница 5 — сумма не меняется");
  // А разница не 5 ловится штатно.
  assert.equal(isValidBarcode("4060682003014"), false);
});

test("UPC-A хранится как EAN-13 с нулём впереди", () => {
  // Иначе один и тот же товар лежал бы в базе двумя записями, и человек,
  // отсканировавший его «не тем» способом, не нашёл бы свою же карточку.
  assert.equal(normalizeBarcode(UPC), `0${UPC}`);
  assert.equal(barcodeFormat(UPC), "ean_13");
});

test("пробелы и дефисы срезаются: код переписывают с упаковки руками", () => {
  assert.equal(normalizeBarcode("4 600682 003014"), MILK);
  assert.equal(normalizeBarcode("4600682-003014"), MILK);
  assert.equal(normalizeBarcode("  4600682003014  "), MILK);
});

test("мусор не проходит", () => {
  for (const junk of ["", "абв", "460068200301", "46006820030144", "4600682o03014", "-1"]) {
    assert.equal(normalizeBarcode(junk), null, `принят мусор: ${JSON.stringify(junk)}`);
  }
});

test("формат определяется по длине", () => {
  assert.equal(barcodeFormat(MILK), "ean_13");
  assert.equal(barcodeFormat(SHORT), "ean_8");
  assert.equal(barcodeFormat("нет"), null);
});

test("страна регистрации — по префиксу, и только для тринадцатизначных", () => {
  assert.equal(barcodeRegion(MILK), "Россия");
  assert.equal(barcodeRegion("4870000000006"), null, "не EAEU-префикс");
  assert.equal(barcodeRegion(COKE), null, "Великобритания в списке не значится");
  assert.equal(barcodeRegion(SHORT), null, "восьмизначный код страну не определяет");
});

test("внутренние коды магазина отсекаются", () => {
  // Весовая нарезка: в коде зашиты вес и цена конкретной упаковки, и завтра
  // та же цифра будет означать другой товар. В общую базу такое нельзя.
  const store = "2312345678904";
  assert.equal(isValidBarcode(store), true, "сам по себе код валиден");
  assert.equal(isStoreInternal(store), true);
  assert.equal(isStoreInternal(MILK), false);
  assert.equal(isStoreInternal(COKE), false);
});

test("читаемая запись совпадает с тем, как код напечатан на упаковке", () => {
  assert.equal(formatBarcode(MILK), "4 600682 003014");
  assert.equal(formatBarcode(SHORT), "9638 5074");
  // Непонятное значение возвращаем как есть: показать «null» вместо кода
  // хуже, чем показать неудачный код.
  assert.equal(formatBarcode("что-то"), "что-то");
});
