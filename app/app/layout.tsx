import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "../logo";
import { SiteFooter } from "../site-footer";
import { logout } from "../auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <div className="shell">
    <header className="shell-header">
      {/* Слово в <b>, а не текстовым узлом: на узком экране оно прячется, и
          освободившееся место достаётся навигации. Знак остаётся всегда — по
          нему возвращаются на «Сегодня». */}
      <Link className="logo" href="/app"><span><Logo /></span><b>Живое Тело</b></Link>
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
    {/* Подвал — тот же, что на сайте.
        Раньше здесь стоял свой, укороченный: считалось, что в кабинете человек
        работает с дневником, а не выбирает, что почитать. На деле кабинет
        оказался тупиком — из него не было дороги ни к расчётам, ни к каталогу
        блюд, ни к полному списку документов, а именно за ними отсюда и уходят.
        Ширину подвал берёт от кабинета (правило `.shell>footer`), поэтому
        колонки встают под контентом, а не шире него. */}
    <SiteFooter authed />
  </div>;
}
