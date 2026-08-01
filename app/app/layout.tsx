import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { Logo } from "../logo";
import { logout } from "../auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <div className="shell">
    <header className="shell-header">
      <Link className="logo" href="/app"><span><Logo /></span>Живое Тело</Link>
      <nav className="shell-nav">
        <Link href="/app">Сегодня</Link>
        <Link href="/app/add">Добавить</Link>
        <Link href="/app/inbox">Инбокс</Link>
        <Link href="/app/weight">Вес</Link>
        <Link href="/app/review">Обзор</Link>
        <Link href="/app/settings">Настройки</Link>
        <Link href="/app/specialists">Доступ</Link>
      </nav>
      <form action={logout}><button className="link-button" type="submit">Выйти</button></form>
    </header>
    <div className="shell-content">{children}</div>
    <footer className="shell-footer">
      <p>{NOT_MEDICAL_DISCLAIMER}</p>
      {/* Дорога обратно на сайт. Полного меню здесь нет сознательно: в
          кабинете человек работает со своим дневником, а не выбирает, что
          почитать, и семь разделов сайта поверх семи разделов кабинета
          сделали бы навигацию вдвое шумнее. Логотип ведёт на «Сегодня» —
          домой внутри приложения; сайт живёт здесь, внизу, как и везде. */}
      <div className="legal-links">
        <Link href="/">Главная сайта</Link>
        <Link href="/pro">Живое Тело Pro</Link>
        <Link href="/skolko-kalorij">Калькуляторы</Link>
      </div>
      <div className="legal-links">
        <Link href="/legal/health">Границы сервиса</Link>
        <Link href="/legal/terms">Соглашение</Link>
        <Link href="/legal/privacy">Конфиденциальность</Link>
        <Link href="/legal/consent">Согласие</Link>
        <Link href="/legal/cookies">Cookie</Link>
      </div>
    </footer>
  </div>;
}
