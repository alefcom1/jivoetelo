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
  icons: { icon: "/favicon.svg" },
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
