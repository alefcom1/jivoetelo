import { AI_PHOTO_PATH } from "./ai/photo-link.ts";

/**
 * Правила robots.txt — отдельно от `app/robots.ts`.
 *
 * ## Зачем отдельный файл
 *
 * Чтобы их можно было проверить тестом. Файл в `app/` импортирует типы Next
 * и ходит через псевдоним `@/`, который вне сборки не разрешается, — то есть
 * из обычного теста он недоступен. А проверять здесь есть что: одна строка
 * в этом списке однажды тихо сломала разбор фото целиком.
 *
 * ## Что именно сломалось
 *
 * `/api/` закрыт целиком, и это правильно: за ним авторизация и служебные
 * маршруты, которым нечего делать в выдаче. Но под общий запрет попал и путь,
 * по которому модель забирает снимок для разбора (lib/ai/photo-link.ts).
 * Загрузчик картинок Anthropic читает robots.txt и отказался:
 *
 *     400 invalid_request_error:
 *     This URL is disallowed by the website's robots.txt file.
 *
 * Снаружи это выглядело как «сервис разбора сейчас недоступен». Связать отказ
 * модели с файлом robots — вещью из совсем другой части проекта — без строки
 * в логе было нечем; поэтому теперь их сверяет тест.
 */

/**
 * Порядок и длина имеют значение. По стандарту при споре правил выигрывает
 * то, у которого совпал более длинный префикс пути: `/api/ai-photo/` длиннее
 * `/api/`, поэтому разрешение перевешивает запрет — по правилу, а не по
 * удаче с порядком строк.
 */
export const ROBOTS_ALLOW = ["/", `${AI_PHOTO_PATH}/`];

/**
 * `/tg` закрыт и своими метаданными — здесь дублируем, потому что robots
 * читают до того, как заглянут внутрь страницы.
 */
export const ROBOTS_DISALLOW = ["/app/", "/tg", "/tg/", "/api/", "/pochta/"];

export const ROBOTS_SITEMAP = "https://jivoetelo.ru/sitemap.xml";

/**
 * Какое правило применимо к пути: то, чей префикс совпал и оказался длиннее.
 * Пустая строка — не совпало ни одно.
 */
export function longestRuleFor(path: string, rules: readonly string[]): string {
  return rules
    .filter((rule) => path.startsWith(rule))
    .reduce((best, rule) => (rule.length > best.length ? rule : best), "");
}

/** Пустит ли robots.txt робота по этому пути. */
export function robotsAllows(path: string): boolean {
  return longestRuleFor(path, ROBOTS_ALLOW).length > longestRuleFor(path, ROBOTS_DISALLOW).length;
}
