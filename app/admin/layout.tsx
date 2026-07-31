import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import "./admin.css";

// Раздел не должен попадать в поиск: это внутренний инструмент, а не
// страница сайта, и его существование незачем подсказывать никому, кроме
// тех, кто и так знает адрес.
export const metadata: Metadata = {
  title: "Админка — Живое Тело",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Именно notFound(), а не редирект на страницу «нет доступа» и не текст
  // «требуются права администратора». Постороннему незачем знать, что по
  // этому адресу вообще что-то есть: 404 неотличим от «такой страницы не
  // существует», а сообщение об отказе доступа — прямая подсказка, что
  // страница существует и что-то охраняет.
  if (!admin) notFound();

  return (
    <div className="adm-shell">
      <header className="adm-header">
        <Link className="adm-logo" href="/">
          Живое Тело
        </Link>
        <span className="adm-title">Админка · Живое Тело Pro</span>
        <span className="adm-you">{admin.email}</span>
      </header>
      <main className="adm-main">{children}</main>
    </div>
  );
}
