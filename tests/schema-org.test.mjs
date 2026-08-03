import assert from "node:assert/strict";
import { test } from "node:test";
import {
  breadcrumbsJsonLd,
  definedTermJsonLd,
  itemListJsonLd,
  jsonLdScript,
  organizationJsonLd,
  webApplicationJsonLd,
  webSiteJsonLd,
} from "../lib/schema-org.ts";

/**
 * Разметка ломается молча: невалидный JSON-LD не роняет страницу, его просто
 * никто не читает. Поэтому проверяем то, из-за чего узел перестаёт
 * засчитываться, — а не то, что он вообще собрался.
 */

test("у каждого узла есть контекст и тип", () => {
  const nodes = [
    organizationJsonLd(),
    webSiteJsonLd(),
    breadcrumbsJsonLd([{ name: "Расчёты", path: "/raschet" }]),
    itemListJsonLd({ name: "Блюда", items: [{ name: "Борщ", path: "/skolko-kalorij/borshch" }] }),
    webApplicationJsonLd({ name: "Калькулятор", description: "Считает", path: "/raschet/energiya" }),
    definedTermJsonLd({ name: "TDEE", description: "Полный расход", path: "/slovar/tdee" }),
  ];

  for (const node of nodes) {
    assert.equal(node["@context"], "https://schema.org", `нет контекста у ${node["@type"]}`);
    assert.ok(typeof node["@type"] === "string" && node["@type"].length > 0, "нет типа");
  }
});

test("адреса в разметке абсолютные", () => {
  // Относительный адрес в JSON-LD — самая частая и самая незаметная ошибка:
  // страница выглядит размеченной, а робот не может разрешить ссылку.
  const crumbs = breadcrumbsJsonLd([
    { name: "Калорийность блюд", path: "/skolko-kalorij" },
    { name: "Борщ", path: "/skolko-kalorij/borshch" },
  ]);

  for (const item of crumbs.itemListElement) {
    assert.match(item.item, /^https:\/\//, `не абсолютный адрес: ${item.item}`);
  }
});

test("позиции цепочки нумеруются с единицы и по порядку", () => {
  const crumbs = breadcrumbsJsonLd([
    { name: "Расчёты", path: "/raschet" },
    { name: "Расчёт энергии", path: "/raschet/energiya" },
  ]);

  assert.deepEqual(crumbs.itemListElement.map((i) => i.position), [1, 2]);
  // Последняя крошка — сама страница, и у неё тоже должен быть адрес:
  // Яндекс разбирает цепочку целиком, а не «до текущей».
  assert.equal(crumbs.itemListElement.at(-1).item, "https://jivoetelo.ru/raschet/energiya");
});

test("список раздела знает свою длину", () => {
  const list = itemListJsonLd({
    name: "Блюда",
    items: [
      { name: "Борщ", path: "/skolko-kalorij/borshch" },
      { name: "Оливье", path: "/skolko-kalorij/olive" },
    ],
  });

  assert.equal(list.numberOfItems, 2);
  assert.deepEqual(list.itemListElement.map((i) => i.position), [1, 2]);
});

test("калькулятор размечен как бесплатный явным предложением", () => {
  // Без `offers` бесплатность остаётся словом в тексте страницы: машине её
  // прочитать неоткуда.
  const app = webApplicationJsonLd({ name: "Калькулятор", description: "Считает", path: "/raschet/temp" });
  assert.equal(app.isAccessibleForFree, true);
  assert.equal(app.offers.price, "0");
  assert.equal(app.offers.priceCurrency, "RUB");
});

test("организация и сайт связаны через @id", () => {
  // На организацию ссылаются `publisher` со страниц. Разъедутся идентификаторы
  // — ссылка повиснет, и брендовый узел перестанет собираться в один.
  const org = organizationJsonLd();
  const site = webSiteJsonLd();
  const app = webApplicationJsonLd({ name: "К", description: "О", path: "/raschet" });

  assert.equal(site.publisher["@id"], org["@id"]);
  assert.equal(app.publisher["@id"], org["@id"]);
});

test("вывод для страницы — валидный JSON и без сырых угловых скобок", () => {
  // `</script>` внутри строки данных закрыл бы тег раньше времени и сломал
  // бы страницу целиком, а не только разметку.
  const script = jsonLdScript(
    breadcrumbsJsonLd([{ name: "</script><b>Борщ", path: "/skolko-kalorij/borshch" }]),
  );

  assert.doesNotMatch(script, /</, "в выводе осталась сырая угловая скобка");
  const parsed = JSON.parse(script);
  assert.equal(parsed.itemListElement[0].name, "</script><b>Борщ");
});
