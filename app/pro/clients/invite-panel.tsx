"use client";

import { useActionState } from "react";
import { createInvite, type InviteState } from "./actions";

const initialState: InviteState = { status: "idle" };

/**
 * Панель выдачи кода. Код не хранится нигде на сервере ради интерфейса —
 * при перезагрузке страницы он пропадёт, и это правильно: код живёт час,
 * а не является постоянным свойством специалиста, которое стоит помнить
 * между заходами.
 */
export function InvitePanel() {
  const [state, action, pending] = useActionState(createInvite, initialState);

  const code = state.status === "ready" ? state.code : null;
  // Две группы по четыре знака — так код удобнее продиктовать по телефону,
  // не сбившись на середине восьмизначной строки.
  const grouped = code ? `${code.slice(0, 4)} ${code.slice(4)}` : null;

  return (
    <section className="pro-cab-invite">
      <div className="pro-cab-invite-text">
        <h2>Пригласить клиента</h2>
        <p>
          Код живёт час, назовите его клиенту — он введёт его у себя в приложении и сам решит,
          что вам показать.
        </p>
        {state.status === "denied" && (
          <p className="form-error">Доступ к разделу закончился — обновите страницу и попробуйте снова.</p>
        )}
        {state.status === "error" && (
          <p className="form-error">Не получилось создать код. Попробуйте ещё раз через минуту.</p>
        )}
      </div>

      <form action={action} className="pro-cab-invite-form">
        {grouped && (
          <div className="pro-cab-code" aria-live="polite">
            <span className="pro-cab-code-value">{grouped}</span>
          </div>
        )}
        <button type="submit" className="black-button" disabled={pending}>
          {pending ? "Создаём…" : code ? "Ещё код" : "Пригласить клиента"}
        </button>
      </form>
    </section>
  );
}
