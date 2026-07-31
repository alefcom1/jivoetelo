import type { MetadataRoute } from "next";
import { DISHES } from "@/lib/dishes";
import { LEGAL_UPDATED_AT } from "@/lib/legal";

/**
 * Карта сайта. Нужна прежде всего программатик-страницам: на страницы блюд
 * ведут только внутренние ссылки, и без карты поисковик доберётся до хвоста
 * каталога нескоро.
 *
 * Здесь только публичные страницы. Приложение (`/app/*`), Mini App и почтовые
 * маршруты в индекс не идут: за авторизацией индексировать нечего, а `/tg`
 * к тому же закрыт `robots` в своих метаданных.
 */
const SITE_URL = "https://jivoetelo.ru";

const STATIC_PAGES: Array<{ path: string; priority: number; changeFrequency: "monthly" | "yearly" }> = [
  { path: "/", priority: 1, changeFrequency: "monthly" },
  { path: "/raschet", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/plan", priority: 0.9, changeFrequency: "monthly" },
  { path: "/raschet/energiya", priority: 0.9, changeFrequency: "monthly" },
  { path: "/raschet/belok", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/temp", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/kviz", priority: 0.7, changeFrequency: "monthly" },
  { path: "/skolko-kalorij", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pro", priority: 0.7, changeFrequency: "monthly" },
  { path: "/register", priority: 0.6, changeFrequency: "yearly" },
  { path: "/login", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/consent", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/health", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/cookies", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Дата сборки, а не «сейчас» на каждый запрос: страницы статические, и
  // ежедневно менять lastModified у неизменившегося текста — способ научить
  // поисковик не верить этому полю.
  const lastModified = new Date(LEGAL_UPDATED_AT);

  return [
    ...STATIC_PAGES.map((page) => ({
      url: `${SITE_URL}${page.path}`,
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...DISHES.map((dish) => ({
      url: `${SITE_URL}/skolko-kalorij/${dish.slug}`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
