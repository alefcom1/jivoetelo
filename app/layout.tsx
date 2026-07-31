import type { Metadata } from "next";
import { YandexMetrika } from "./metrika";
import "./fonts.css";
import "./globals.css";

// Картинку для соцсетей отдаём в JPEG 1200×630 (~96 КБ): это формат, который
// понимают все сборщики превью, включая Telegram и VK. Раньше здесь лежал
// PNG на 2,2 МБ — часть сборщиков просто не дожидалась загрузки.
const ogImage = { url: "/og.jpg", width: 1200, height: 630, alt: "Живое Тело — питание в вашем ритме" };

export const metadata: Metadata = {
  metadataBase: new URL("https://jivoetelo.ru"),
  title: "Живое Тело — питание в вашем ритме",
  description: "Умный навигатор питания, который помогает выбрать следующий шаг без давления и запретов.",
  // Значок сайта в четырёх форматах, и это не перестраховка. SVG понимают
  // браузеры — и почти никто больше: сервисы, которые рисуют значок рядом с
  // именем сайта (поиск, список счётчиков в Метрике, превью ссылок),
  // забирают его отдельным роботом и ждут растр. Пока здесь стоял один
  // SVG, для них сайт был без значка вовсе.
  //
  // Порядок важен: роботы берут первое, что понимают, а браузеры выбирают по
  // type и предпочитают SVG — поэтому он последний.
  //
  // Файлы собирает scripts/favicon.mjs из того же public/favicon.svg.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  // Подтверждения прав на сайт. Проверяются по корню, но отдаём на всех
  // страницах: теги безвредные, а привязывать их к одному маршруту — значит
  // однажды потерять при перекладывании главной.
  //
  // `other` нужен потому, что у платёжной системы тег называется просто
  // `verification`, а встроенные поля Next покрывают только известных ему
  // проверяющих (google, yandex, yahoo, me).
  verification: {
    google: "VBapmnl9xgeyP2RCGlFlS98ynJVAQ0LUhl4R_0uL1s8",
    yandex: "a8d71d16c0064b34",
    other: { verification: "137dd42d7b9768006bc3a6e8ce74bc" },
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Живое Тело",
    url: "https://jivoetelo.ru",
    title: "Живое Тело",
    description: "Питание в ритме вашего тела.",
    images: [ogImage],
  },
  twitter: { card: "summary_large_image", title: "Живое Тело", description: "Питание в ритме вашего тела.", images: [ogImage] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru">
    <head>
      {/* Кириллические подмножества нужны на любой странице — просим браузер
          начать их загрузку сразу, не дожидаясь разбора CSS. */}
      <link rel="preload" href="/fonts/cormorant-garamond-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    </head>
    <body>
      {children}
      <YandexMetrika />
    </body>
  </html>;
}
