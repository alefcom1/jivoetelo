/**
 * Абсолютный адрес сайта. Нужен там, где относительной ссылки недостаточно:
 * в письмах и в кнопках Telegram — их читают вне браузера, где некуда
 * достроить путь.
 */

const DEFAULT_SITE_URL = "https://jivoetelo.ru";

export function siteUrl(): string {
  const raw = process.env.SITE_URL?.trim() || DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
