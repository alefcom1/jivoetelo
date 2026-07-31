"use client";

import { useActionState } from "react";
import {
  applyReset,
  requestReset,
  type ApplyResetState,
  type RequestResetState,
} from "../reset-actions";

/** Восемь — та же нижняя граница, что при регистрации. */
const MIN_PASSWORD_LENGTH = 8;

const applyErrors: Partial<Record<ApplyResetState["status"], string>> = {
  too_short: `Пароль короче ${MIN_PASSWORD_LENGTH} символов.`,
  mismatch: "Пароли не совпали.",
  not_found: "Такой ссылки нет. Возможно, она из старого письма — запросите новую.",
  expired: "Ссылка истекла: она действует час. Запросите новую.",
  used: "Этой ссылкой уже воспользовались. Если это были не вы, запросите новую и смените пароль.",
  error: "Не получилось сменить пароль. Попробуйте ещё раз через минуту.",
};

export function ResetForms({ token }: { token: string | null }) {
  return token ? <ApplyForm token={token} /> : <RequestForm />;
}

function RequestForm() {
  const [state, action, pending] = useActionState(requestReset, { status: "idle" } as RequestResetState);

  // Успех показываем вместо формы: повторно жать «отправить» незачем, а
  // оставленная форма провоцирует именно это.
  if (state.status === "sent") {
    return <>
      <h1>Письмо отправлено.</h1>
      <p className="auth-note">
        Если этот адрес у нас есть, на него ушла ссылка для смены пароля. Она действует час.
      </p>
      <p className="auth-note">
        Не пришло за пару минут — посмотрите в спаме. Ответ здесь одинаковый для любого адреса:
        так форма не превращается в способ узнать, кто у нас зарегистрирован.
      </p>
    </>;
  }

  return <>
    <h1>Забыли пароль?</h1>
    <p className="auth-note">Пришлём ссылку для смены пароля на вашу почту.</p>
    <form action={action}>
      <label>E-mail
        <input name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      {state.status === "invalid" && <p className="form-error">Похоже, в адресе опечатка.</p>}
      <button className="black-button" type="submit" disabled={pending}>
        {pending ? "Отправляем…" : "Прислать ссылку"}
      </button>
    </form>
  </>;
}

function ApplyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(applyReset, { status: "idle" } as ApplyResetState);

  return <>
    <h1>Новый пароль.</h1>
    <p className="auth-note">
      После смены мы завершим все входы на других устройствах — на случай, если пароль меняют
      как раз поэтому.
    </p>
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <label>Новый пароль
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoFocus
        />
      </label>
      <label>Ещё раз
        <input name="repeat" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </label>
      {applyErrors[state.status] && <p className="form-error">{applyErrors[state.status]}</p>}
      <button className="black-button" type="submit" disabled={pending}>
        {pending ? "Меняем…" : "Сменить пароль и войти"}
      </button>
    </form>
  </>;
}
