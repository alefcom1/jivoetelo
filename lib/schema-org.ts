/**
 * Разметка schema.org — одним местом на весь сайт.
 *
 * Почему это понадобилось отдельным модулем. До сих пор единственной
 * разметкой был `FAQPage`, собранный вручную на четырёх страницах. В 2026-м
 * он перестал что-либо давать: Google не показывает по нему расширенные
 * сниппеты с 7 мая 2026, а в официальном списке поддерживаемых типов Яндекса
 * его нет вовсе. То есть на сегодня мы размечены нулём
 * (`docs/seo-plan-2026-08.md`, п. 3.7).
 *
 * `FAQPage` при этом не удаляем: сниппетов он не даёт, но остаётся
 * структурой, из которой извлекают ответ Алиса и языковые модели, — а это
 * ровно тот канал, где мы хотим быть источником.
 *
 * Что действительно работает и добавляется здесь:
 *
 * - `BreadcrumbList` — Яндекс поддерживает официально. Визуальная цепочка на
 *   страницах давно есть, разметки к ней не было; самый очевидный незакрытый
 *   пункт из аудита.
 * - `Organization` + `WebSite` — брендовый сигнал, ставится один раз в
 *   layout.
 * - `WebApplication` — на калькуляторы, взамен мёртвого `FAQPage`.
 *
 * Чего здесь намеренно нет: `HowTo` (мёртв полностью) и `Recipe` как способ
 * получить звёздочки в выдаче — у Яндекса он только для кулинарных сайтов
 * через партнёрскую программу с ручной модерацией, а у Google фича
 * «Nutrition Facts» выпиливается. `Recipe` ставим там, где страница
 * действительно рецепт, и ради машинного чтения.
 */

import { absoluteUrl, siteUrl } from "./site.ts";

export const ORGANIZATION_NAME = "Живое Тело";

/** Тип узла JSON-LD: произвольный объект со `@type`. */
export type JsonLd = Record<string, unknown>;

/**
 * Организация и сайт. Оба узла ставятся один раз в корневом layout.
 *
 * `@id` нужен, чтобы на организацию можно было сослаться из других узлов
 * (`publisher`, `author`), не повторяя её описание на каждой странице.
 */
export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: ORGANIZATION_NAME,
    url: siteUrl(),
    logo: absoluteUrl("/favicon-96.png"),
    description:
      "Навигатор питания: дневник еды с разбором по фото, честные диапазоны калорийности и план, который подстраивается по вашим данным.",
  };
}

export function webSiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: ORGANIZATION_NAME,
    url: siteUrl(),
    inLanguage: "ru-RU",
    publisher: { "@id": `${siteUrl()}/#organization` },
  };
}

export type Crumb = {
  name: string;
  /** Путь от корня. У последней крошки — путь самой страницы. */
  path: string;
};

/**
 * Навигационная цепочка.
 *
 * Последний элемент — сама страница, и он тоже с адресом: Яндекс разбирает
 * цепочку целиком, а не «до текущей». Позиции нумеруются с единицы.
 */
export function breadcrumbsJsonLd(crumbs: Crumb[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Калькулятор как веб-приложение.
 *
 * `offers` с нулевой ценой — не маркетинг, а обязательное поле для того,
 * чтобы бесплатность читалась машиной: без него «бесплатно» остаётся словом
 * в тексте страницы.
 */
export function webApplicationJsonLd(input: {
  name: string;
  description: string;
  path: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    applicationCategory: "HealthApplication",
    operatingSystem: "Any",
    inLanguage: "ru-RU",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
    publisher: { "@id": `${siteUrl()}/#organization` },
  };
}

/**
 * Список позиций раздела — для страниц-хабов (каталог блюд, каталог
 * продуктов, глоссарий).
 */
export function itemListJsonLd(input: {
  name: string;
  items: Array<{ name: string; path: string }>;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: input.name,
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

/**
 * Термин глоссария. `DefinedTerm` внутри `DefinedTermSet` — то, чем
 * размечают словари; из всех типов он ближе всего к тому, что мы делаем, и
 * его понимают извлекающие ответ модели.
 */
export function definedTermJsonLd(input: {
  name: string;
  description: string;
  path: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Словарь «Живого Тела»",
      url: absoluteUrl("/slovar"),
    },
  };
}

/**
 * Готовая строка для `dangerouslySetInnerHTML`.
 *
 * Экранируем `<` — иначе последовательность вроде `</script>` внутри строки
 * данных закрыла бы тег раньше времени. Для наших текстов это
 * маловероятно, но цена защиты — один `replace`, а цена пропуска — сломанная
 * страница.
 */
export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
