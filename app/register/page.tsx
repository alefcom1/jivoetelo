"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register, type AuthState } from "../auth-actions";

const errors: Partial<Record<AuthState["status"], string>> = {
  invalid_email: "Похоже, в адресе опечатка — проверьте и попробуйте ещё раз.",
  weak_password: "Пароль должен быть не короче 8 символов.",
  email_taken: "Такой адрес уже зарегистрирован — попробуйте войти.",
  error: "Не получилось создать аккаунт. Попробуйте ещё раз через минуту.",
};

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, { status: "idle" } as AuthState);

  return <main className="auth-page">
    <div className="auth-card">
      <Link className="logo" href="/"><span>Ж</span>Живое Тело</Link>
      <h1>Начнём.</h1>
      <p className="auth-lead">Дневник питания, который помогает выбрать следующий шаг — без давления и запретов.</p>
      <form action={action}>
        <label>E-mail<input name="email" type="email" autoComplete="email" required autoFocus /></label>
        <label>Пароль<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}
        <button className="black-button" type="submit" disabled={pending}>{pending ? "Создаём…" : "Создать аккаунт"}</button>
      </form>
      <p className="auth-switch">Уже есть аккаунт? <Link href="/login">Войти</Link></p>
    </div>
  </main>;
}
