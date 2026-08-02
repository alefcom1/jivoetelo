/**
 * Состав главного меню — отдельно от разметки шапки.
 *
 * ## Зачем отдельный файл
 *
 * В шапке меню жило прямо в JSX, и там накопилось три ошибки, каждую из
 * которых видно только глазами и только если знать, куда смотреть:
 *
 *  - «Продукт» и «Решения» открывали одну и ту же панель с обоими списками
 *    сразу — состояние на всю шапку было одно;
 *  - «О нас» вело на якорь `about`, которого на главной нет вовсе, — кнопка
 *    просто ничего не делала;
 *  - ссылки внутри панели никто не сверял с настоящими маршрутами.
 *
 * Здесь это данные, а не разметка, поэтому их можно проверить тестом:
 * tests/site-nav.test.mjs сверяет каждый адрес с файлами приложения, а
 * каждый якорь — с настоящими `id` на главной.
 */

export type NavLink = { href: string; label: string };

/** Раздел меню: либо со своей выпадающей панелью, либо просто якорь. */
export type NavSection =
  | { label: string; links: NavLink[] }
  | { label: string; anchor: string };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Продукт",
    links: [
      { href: "/#experience", label: "Дневник питания" },
      { href: "/raschet/plan", label: "Персональный план" },
      { href: "/skolko-kalorij", label: "Сколько калорий в блюде" },
    ],
  },
  {
    label: "Решения",
    links: [
      { href: "/raschet", label: "Для себя" },
      { href: "/pro", label: "Для специалистов" },
      { href: "/raschet/kviz", label: "Подобрать по вопросам" },
    ],
  },
  { label: "Журнал", anchor: "journal" },
  { label: "О нас", anchor: "principles" },
];

export function hasLinks(section: NavSection): section is { label: string; links: NavLink[] } {
  return "links" in section;
}

/** Подпись под панелью — та же на обеих, это часть оформления, а не навигация. */
export const NAV_ASIDE = { line: "Считает по фотографии.", accent: "Работает в Telegram." };
