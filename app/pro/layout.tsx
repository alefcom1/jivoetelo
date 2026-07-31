import type { Metadata } from "next";
import Link from "next/link";
import "./pro.css";
import { Logo } from "../logo";

/**
 * Оболочка раздела для специалистов. Своя, а не общая с `/raschet`, по той же
 * причине, по которой у расчётов она отдельная: у раздела свой призыв к
 * действию. Специалисту незачем предлагать «начать бесплатно» — он пришёл не
 * заводить дневник, а посмотреть на кабинет.
 */
export const metadata: Metadata = {
  title: "Живое Тело Pro",
};

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <div className="pro-shell">
    <header className="pro-header">
      <Link className="logo" href="/"><span><Logo /></span>Живое Тело</Link>
      <Link className="header-cta" href="/pro#apply">Заявка в пилот</Link>
    </header>
    {children}
  </div>;
}
