import type { Metadata } from "next";
import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";
import "./legal.css";

export const metadata: Metadata = {
  title: "Документы — Живое Тело",
  description: "Пользовательское соглашение, политика конфиденциальности и согласия сервиса «Живое Тело».",
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <div className="legal-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
