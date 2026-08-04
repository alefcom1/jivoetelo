import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/articles";
import { DISHES, dishUpdatedAt } from "@/lib/dishes";
import { GLOSSARY } from "@/lib/glossary";
import { PRODUCTS } from "@/lib/products";
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
  { path: "/raschet/suhoe-varenoe", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/porcii", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/imt", priority: 0.9, changeFrequency: "monthly" },
  { path: "/raschet/bzhu", priority: 0.9, changeFrequency: "monthly" },
  { path: "/raschet/kaloriynost-blyuda", priority: 0.9, changeFrequency: "monthly" },
  { path: "/raschet/voda", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/gramm-v-stakane", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/prognoz-vesa", priority: 0.8, changeFrequency: "monthly" },
  { path: "/raschet/porciya-ladonyu", priority: 0.7, changeFrequency: "monthly" },
  { path: "/raschet/kletchatka", priority: 0.7, changeFrequency: "monthly" },
  { path: "/kak-schitaem", priority: 0.8, changeFrequency: "monthly" },
  { path: "/slovar", priority: 0.7, changeFrequency: "monthly" },
  { path: "/skolko-kalorij", priority: 0.8, changeFrequency: "monthly" },
  { path: "/produkty", priority: 0.8, changeFrequency: "monthly" },
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
    // Каталог продуктов: на страницы ведут только внутренние ссылки, и без
    // карты поисковик добрался бы до хвоста нескоро — ровно та причина, по
    // которой карта заведена для блюд.
    ...PRODUCTS.map((product) => ({
      url: `${SITE_URL}/produkty/${product.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...GLOSSARY.map((term) => ({
      url: `${SITE_URL}/slovar/${term.slug}`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
    ...DISHES.map((dish) => ({
      url: `${SITE_URL}/skolko-kalorij/${dish.slug}`,
      // Дата содержимого блюда, а не дата правки оферты: см. DISHES_UPDATED_AT.
      lastModified: dishUpdatedAt(dish),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    // Журнал: у статей — их собственная дата публикации.
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(
        ARTICLES.reduce((latest, a) => (a.published > latest ? a.published : latest), ARTICLES[0].published),
      ),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    ...ARTICLES.map((article) => ({
      url: `${SITE_URL}/blog/${article.slug}`,
      lastModified: new Date(article.published),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
