import type { Metadata } from "next";
import Link from "next/link";
import "./legal.css";

export const metadata: Metadata = {
  title: "Документы — Живое Тело",
  description: "Пользовательское соглашение, политика конфиденциальности и согласия сервиса «Живое Тело».",
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <div className="legal-shell">
    <header className="legal-header">
      <Link className="logo" href="/"><span>Ж</span>Живое Тело</Link>
      <Link className="back" href="/">На главную →</Link>
    </header>
    {children}
  </div>;
}
