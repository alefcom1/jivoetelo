import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
import "./blog.css";
import { SiteFooter } from "../site-footer";

export const metadata: Metadata = {
  title: "Журнал — Живое Тело",
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="blog-shell">
    <SiteHeader />
    {children}
    <SiteFooter />
  </div>;
}
