"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { register, type AuthState } from "../auth-actions";
import { Logo } from "../logo";
import { TelegramLogin } from "../telegram-login";

const errors: Partial<Record<AuthState["status"], string>> = {
  invalid_email: "Похоже, в адресе опечатка — проверьте и попробуйте ещё раз.",
  weak_password: "Пароль должен быть не короче 8 символов.",
  email_taken: "Такой адрес уже зарегистрирован — попробуйте войти.",
  no_consent: "Чтобы создать аккаунт, нужно отметить оба согласия.",
  error: "Не получилось создать аккаунт. Попробуйте ещё раз через минуту.",
};

export function RegisterForm({ botUsername }: { botUsername: string | null }) {
  const [state, action, pending] = useActionState(register, { status: "idle" } as AuthState);
  // Согласия читаются из живой формы, а не из состояния: вход через Telegram
  // происходит вне отправки формы, и к этому моменту состояние ещё пустое.
  const formRef = useRef<HTMLFormElement | null>(null);
  const consentGiven = () => {
    const form = formRef.current;
    if (!form) return false;
    const terms = form.elements.namedItem("consent_terms");
    const ai = form.elements.namedItem("consent_ai");
    return terms instanceof HTMLInputElement && ai instanceof HTMLInputElement && terms.checked && ai.checked;
  };

  return <main className="auth-page">
    <div className="auth-card">
      <Link className="logo" href="/"><span><Logo /></span>Живое Тело</Link>
      <h1>Начнём.</h1>
      <p className="auth-lead">Дневник питания, который помогает выбрать следующий шаг — без давления и запретов.</p>
      <form action={action} ref={formRef}>
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
      {/* Кнопка Telegram — после согласий, а не до: аккаунт по ней заводится
          такой же, и без обеих отметок сервер его не создаст. */}
      <TelegramLogin botUsername={botUsername} consent={consentGiven} />
      <p className="auth-switch">Уже есть аккаунт? <Link href="/login">Войти</Link></p>
      <p className="auth-note">{NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее</Link></p>
    </div>
  </main>;
}
