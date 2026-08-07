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
        <span className="adm-title">Админка</span>
        {/* Навигация появилась, когда разделов стало больше двух. До этого
            админка была одной страницей, и ссылка «сюда же» на ней выглядела
            бы странно. */}
        <nav className="adm-nav">
          <Link href="/admin">Обзор</Link>
          <Link href="/admin/users">Люди</Link>
          <Link href="/admin/rashod">Расход</Link>
          <Link href="/admin/oplaty">Оплаты</Link>
          <Link href="/admin/photos">Снимки</Link>
          <Link href="/admin/vouchers">Ваучеры</Link>
          <Link href="/admin/pro">Специалисты</Link>
          <Link href="/admin/bot">Бот</Link>
        </nav>
        <span className="adm-you">{admin.email}</span>
      </header>
      <main className="adm-main">{children}</main>
    </div>
  );
}
