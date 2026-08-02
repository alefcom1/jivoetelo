import type { MetadataRoute } from "next";
import { ROBOTS_ALLOW, ROBOTS_DISALLOW, ROBOTS_SITEMAP } from "@/lib/robots";

/**
 * Сами правила и рассуждение к ним — в `lib/robots.ts`. Здесь только обёртка
 * под Next: файл в `app/` из обычного теста не импортируется (псевдоним `@/`
 * вне сборки не разрешается), а проверять правила надо — одна строка в них
 * однажды тихо сломала разбор фото целиком.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ROBOTS_ALLOW,
      disallow: ROBOTS_DISALLOW,
    },
    sitemap: ROBOTS_SITEMAP,
  };
}
