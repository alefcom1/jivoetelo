import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
// Та же типографика, что у расчётов, методологии и «О проекте»: страница
// цены — колонка текста, а не отдельный жанр.
//
// Импорт обязателен, и это не формальность. Без него класс `.raschet-page`
// не значит ничего: он живёт в app/raschet/raschet.css, а не в globals.css,
// и страница открывается голым потоком абзацев без шапки и подвала. Ровно
// так уже случалось с блоком «Цена» на главной, когда его стили сочли
// осиротевшими и удалили.
import "../raschet/raschet.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Цена — Живое Тело",
};

export default function TarifyLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
