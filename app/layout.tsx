import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({ variable: "--font-display", subsets: ["cyrillic", "latin"], weight: ["400", "500", "600", "700"] });
const body = Manrope({ variable: "--font-body", subsets: ["cyrillic", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://jivoetelo.ru"),
  title: "Живое Тело — питание в вашем ритме",
  description: "Умный навигатор питания, который помогает выбрать следующий шаг без давления и запретов.",
  openGraph: { title: "Живое Тело", description: "Питание в ритме вашего тела.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Живое Тело", description: "Питание в ритме вашего тела.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={`${display.variable} ${body.variable}`}>{children}</body></html>;
}
