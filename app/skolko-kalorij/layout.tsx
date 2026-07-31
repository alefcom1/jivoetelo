import type { Metadata } from "next";
import Link from "next/link";
// Раздел переиспользует оформление расчётов: это те же справочные страницы с
// колонкой текста, и заводить им отдельную типографику значило бы разойтись
// с остальным сайтом ради одного каталога.
import "../raschet/raschet.css";
import { Logo } from "../logo";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Калорийность блюд — Живое Тело",
};

export default function DishesLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <header className="raschet-header">
      <Link className="logo" href="/"><span><Logo /></span>Живое Тело</Link>
      <Link className="header-cta" href="/register">Начать бесплатно</Link>
    </header>
    {children}
    <SiteFooter />
  </div>;
}
