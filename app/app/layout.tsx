import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "../auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <div className="shell">
    <header className="shell-header">
      <Link className="logo" href="/app"><span>Ж</span>Живое Тело</Link>
      <nav className="shell-nav">
        <Link href="/app">Сегодня</Link>
        <Link href="/app/add">Добавить</Link>
        <Link href="/app/weight">Вес</Link>
        <Link href="/app/review">Обзор</Link>
        <Link href="/app/settings">Настройки</Link>
      </nav>
      <form action={logout}><button className="link-button" type="submit">Выйти</button></form>
    </header>
    <div className="shell-content">{children}</div>
  </div>;
}
