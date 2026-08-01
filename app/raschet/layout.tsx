import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
import "./raschet.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Расчёты — Живое Тело",
};

export default function RaschetLayout({ children }: { children: React.ReactNode }) {
  return <div className="raschet-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
