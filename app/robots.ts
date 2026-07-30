import type { MetadataRoute } from "next";

/**
 * Закрываем от индексации всё, за чем стоит авторизация или чему нечего
 * делать в выдаче. `/tg` закрыт и своими метаданными — здесь дублируем,
 * потому что robots читают до того, как заглянут внутрь страницы.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/tg", "/tg/", "/api/", "/pochta/"],
    },
    sitemap: "https://jivoetelo.ru/sitemap.xml",
  };
}
