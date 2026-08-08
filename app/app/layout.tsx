import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { ACCESS_ANCHOR } from "@/lib/paid";
import { Logo } from "../logo";
import { SiteFooter } from "../site-footer";
import { logout } from "../auth-actions";
import { UserAvatar } from "./user-avatar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const admin = user.email ? isAdminEmail(user.email, process.env.ADMIN_EMAILS) : false;

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
        {/* Ссылка только для администратора.
            404 для посторонних (app/admin/layout.tsx) остаётся как был: тот,
            кого нет в ADMIN_EMAILS, этой ссылки не видит вовсе, и по адресу
            для него по-прежнему ничего нет. Прятать ссылку и от админа —
            это прятать инструмент от того, для кого он сделан. */}
        {admin && <Link href="/admin">Админка</Link>}
      </nav>
      {/* Аватар в шапке — то самое «видно, что доступ открыт», ради чего
          корона и заводилась: она должна попадаться на глаза, а не лежать в
          профиле. Ведёт в настройки: аватар в интерфейсах — привычная дверь
          в свой аккаунт, и заводить рядом отдельную ссылку незачем. */}
      <div className="shell-user">
        <Link className="shell-avatar" href={`/app/settings#${ACCESS_ANCHOR}`} title="Настройки и доступ">
          <UserAvatar avatarKey={user.avatarKey} email={user.email} premium={user.plan === "premium"} />
        </Link>
        <form action={logout}><button className="link-button" type="submit">Выйти</button></form>
      </div>
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
