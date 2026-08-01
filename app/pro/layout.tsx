import type { Metadata } from "next";
import "./pro.css";
import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";

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
    {/* Шапка общая с сайтом, призыв к действию — свой: специалист пришёл
        не заводить дневник, а посмотреть на кабинет. Раньше здесь стоял
        огрызок из логотипа и кнопки, и попасть в меню сайта было некуда. */}
    <SiteHeader cta={{ href: "/pro#apply", label: "Заявка в пилот" }} />
    {children}
    <SiteFooter />
  </div>;
}
