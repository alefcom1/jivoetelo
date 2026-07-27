import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { SiteFooter, SiteHeader } from "./components/site-chrome";
import "./globals.css";
import "./marketing.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jivoetelo.ru"),
  title: {
    default: "JIVELO — AI-навигатор питания",
    template: "%s — JIVELO",
  },
  description: "Распознавайте еду по фото, получайте честную оценку и узнавайте, что лучше съесть дальше.",
  applicationName: "JIVELO",
  keywords: ["счётчик калорий", "дневник питания", "AI питание", "распознавание еды", "план питания"],
  openGraph: {
    title: "JIVELO — не просто считайте. Знайте, что съесть дальше.",
    description: "AI-навигатор питания с честной оценкой, адаптивным планом и понятным следующим шагом.",
    type: "website",
    locale: "ru_RU",
    url: "/",
    siteName: "JIVELO",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "JIVELO — AI-навигатор питания",
    description: "Питание становится проще, когда следующий шаг понятен.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f1e8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={`${display.variable} ${body.variable}`}><SiteHeader/>{children}<SiteFooter/></body></html>;
}
