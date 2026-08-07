import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
// Та же типографика, что у методологии, расчётов, блюд и продуктов: «О
// проекте» — такая же страница с колонкой текста, а не отдельный жанр.
// Без этого импорта класс `.raschet-page` не значит ничего, и страница
// открывается голым потоком абзацев без шапки и подвала.
import "../raschet/raschet.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "О проекте — Живое Тело",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
