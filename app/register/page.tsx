"use client";

import Link from "next/link";
import { useActionState } from "react";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { register, type AuthState } from "../auth-actions";
import { Logo } from "../logo";

const errors: Partial<Record<AuthState["status"], string>> = {
  invalid_email: "Похоже, в адресе опечатка — проверьте и попробуйте ещё раз.",
  weak_password: "Пароль должен быть не короче 8 символов.",
  email_taken: "Такой адрес уже зарегистрирован — попробуйте войти.",
  no_consent: "Чтобы создать аккаунт, нужно отметить оба согласия.",
  error: "Не получилось создать аккаунт. Попробуйте ещё раз через минуту.",
};

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, { status: "idle" } as AuthState);

  return <main className="auth-page">
    <div className="auth-card">
      <Link className="logo" href="/"><span><Logo /></span>Живое Тело</Link>
      <h1>Начнём.</h1>
      <p className="auth-lead">Дневник питания, который помогает выбрать следующий шаг — без давления и запретов.</p>
      <form action={action}>
        {/* defaultValue / defaultChecked из состояния: после server action
            React сбрасывает форму, и без этого любая ошибка стирала бы адрес
            и обе отметки. Пароль не возвращаем — вводится заново. */}
        <label>E-mail<input name="email" type="email" autoComplete="email" defaultValue={state.email ?? ""} required autoFocus /></label>
        <label>Пароль<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        {/* Два согласия, а не одно: принятие условий и обработка данных о
            питании и весе — разные вещи, и вторая требует явного действия. */}
        <label className="consent">
          <input name="consent_terms" type="checkbox" defaultChecked={state.consentTerms ?? false} required />
          <span>Принимаю <Link href="/legal/terms" target="_blank">Пользовательское соглашение</Link> и <Link href="/legal/privacy" target="_blank">Политику конфиденциальности</Link>. Мне есть 14 лет; если меньше 18 — с согласия родителей.</span>
        </label>
        <label className="consent">
          <input name="consent_ai" type="checkbox" defaultChecked={state.consentAi ?? false} required />
          <span>Даю <Link href="/legal/consent" target="_blank">согласие</Link> на обработку данных о питании, весе и фотографий еды, включая передачу обезличенного фото или описания AI-сервису за пределами РФ для разбора блюда.</span>
        </label>
        {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}
        <button className="black-button" type="submit" disabled={pending}>{pending ? "Создаём…" : "Создать аккаунт"}</button>
      </form>
      <p className="auth-switch">Уже есть аккаунт? <Link href="/login">Войти</Link></p>
      <p className="auth-note">{NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее</Link></p>
    </div>
  </main>;
}
