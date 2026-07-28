import type { Metadata } from "next";
import Script from "next/script";
import "./tg.css";

export const metadata: Metadata = {
  title: "Живое Тело",
  // Mini App открывается внутри Telegram — индексировать нечего.
  robots: { index: false, follow: false },
};

export default function TelegramLayout({ children }: { children: React.ReactNode }) {
  return <>
    {/* Официальный скрипт Telegram обязателен: он отдаёт initData, тему и MainButton. */}
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
    <div className="tg-root">{children}</div>
  </>;
}
