import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
// Раздел переиспользует оформление расчётов: это те же справочные страницы с
// колонкой текста, и заводить им отдельную типографику значило бы разойтись
// с остальным сайтом ради одного каталога.
import "../raschet/raschet.css";
// Таблицы состава на страницах блюд размечены классами legal-table — без
// этого импорта они остаются голыми: legal.css грузится только в /legal/*.
import "../legal/legal.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Калорийность блюд — Живое Тело",
};

export default function DishesLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
