import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
// Та же типографика, что у расчётов и блюд: это справочные страницы одного
// вида, и своя вёрстка каталогу продуктов только развела бы сайт по стилям.
import "../raschet/raschet.css";
import "./produkty.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Каталог продуктов — Живое Тело",
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
