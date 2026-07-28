import type { Metadata } from "next";
import Link from "next/link";
import "./raschet.css";

export const metadata: Metadata = {
  title: "Расчёты — Живое Тело",
};

export default function RaschetLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <header className="raschet-header">
      <Link className="logo" href="/"><span>Ж</span>Живое Тело</Link>
      <Link className="header-cta" href="/register">Начать бесплатно</Link>
    </header>
    {children}
  </div>;
}
