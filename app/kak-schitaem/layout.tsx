import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
// Та же типографика, что у расчётов, блюд и продуктов: методология — такая же
// справочная страница с колонкой текста, а не отдельный жанр.
import "../raschet/raschet.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Как мы считаем — Живое Тело",
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
