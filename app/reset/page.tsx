import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../logo";
import { ResetForms } from "./reset-forms";

export const metadata: Metadata = {
  title: "Смена пароля — Живое Тело",
  // Страница восстановления в поиске не нужна и там только мешает.
  robots: { index: false, follow: false },
};

/**
 * Одна страница на два шага: запрос ссылки и установка нового пароля.
 *
 * Разводить их по разным адресам смысла нет — человек попадает сюда либо
 * с формы входа (без токена), либо по ссылке из письма (с токеном), и
 * различает эти случаи наличие параметра, а не маршрут.
 */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return <main className="auth-page">
    <div className="auth-card">
      <Link className="logo" href="/"><span><Logo /></span>Живое Тело</Link>
      <ResetForms token={token ?? null} />
      <p className="auth-switch">Вспомнили пароль? <Link href="/login">Войти</Link></p>
    </div>
  </main>;
}
