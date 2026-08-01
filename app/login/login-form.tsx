"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type AuthState } from "../auth-actions";
import { Logo } from "../logo";
import { TelegramLogin } from "../telegram-login";

const errors: Partial<Record<AuthState["status"], string>> = {
  wrong_credentials: "Не подошли почта или пароль. Проверьте и попробуйте ещё раз.",
  error: "Не получилось войти. Попробуйте ещё раз через минуту.",
};

export function LoginForm({ botUsername }: { botUsername: string | null }) {
  const [state, action, pending] = useActionState(login, { status: "idle" } as AuthState);

  return <main className="auth-page">
    <div className="auth-card">
      <Link className="logo" href="/"><span><Logo /></span>Живое Тело</Link>
      <h1>С возвращением.</h1>
      <form action={action}>
        {/* Адрес возвращается из состояния: React сбрасывает форму после
            server action, а перенабирать почту из-за опечатки в пароле — злит. */}
        <label>E-mail<input name="email" type="email" autoComplete="email" defaultValue={state.email ?? ""} required autoFocus /></label>
        <label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
        {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}
        <button className="black-button" type="submit" disabled={pending}>{pending ? "Входим…" : "Войти"}</button>
      </form>
      {/* Вход через Telegram — под формой, а не над ней: у большинства
          аккаунт заведён почтой, и подменять привычный путь новым незачем. */}
      <TelegramLogin botUsername={botUsername} />
      <p className="auth-switch">
        <Link href="/reset">Забыли пароль?</Link>
      </p>
      <p className="auth-switch">Ещё нет аккаунта? <Link href="/register">Создать</Link></p>
    </div>
  </main>;
}
