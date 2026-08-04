import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
// Словарь — те же справочные страницы, что расчёты и каталоги: одна
// типографика на весь публичный контент, никакого отдельного стиля разделу.
import "../raschet/raschet.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Словарь — Живое Тело",
};

export default function GlossaryLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
