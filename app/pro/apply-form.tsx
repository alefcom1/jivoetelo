"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CLIENTS_COUNT_OPTIONS } from "@/lib/pro/application";
import { applyForPro, type ProApplyState } from "./apply-action";

// Сообщения об ошибках. Без кодов и слова «ошибка»: человек не сделал ничего
// неправильного, он просто чего-то не заполнил.
//
// Автофокуса на первом поле здесь намеренно нет: форма стоит в самом низу
// длинной страницы, и фокус при загрузке утащил бы читателя вниз, мимо всего,
// ради чего он пришёл.
const errors: Partial<Record<ProApplyState["status"], string>> = {
  invalid_email: "Похоже, в адресе опечатка — проверьте и попробуйте ещё раз.",
  no_name: "Укажите ваше имя.",
  no_consent: "Чтобы подать заявку, нужно отметить согласие на обработку данных.",
  error: "Не получилось отправить заявку. Попробуйте ещё раз через минуту.",
};

export function ProApplyForm() {
  const [state, action, pending] = useActionState(applyForPro, { status: "idle" } as ProApplyState);

  // После успеха показываем благодарственное сообщение вместо формы.
  if (state.status === "success") {
    return (
      <div className="pro-done">
        <h2>Спасибо за заявку</h2>
        <p>Мы получили вашу анкету. Свяжемся на указанный адрес в течение нескольких дней.</p>
        <p>Отбираем специалистов для пилота руками — нужно убедиться, что формат подходит вам.</p>
      </div>
    );
  }

  return (
    <form action={action} className="pro-form">
      {/* Email — обязательный, required, type=email */}
      <div className="pro-field">
        <label htmlFor="pro-email">E-mail</label>
        <input
          id="pro-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email ?? ""}
          required
        />
      </div>

      {/* Имя — обязательное, required */}
      <div className="pro-field">
        <label htmlFor="pro-name">Имя</label>
        <input
          id="pro-name"
          name="name"
          type="text"
          defaultValue={state.name ?? ""}
          required
        />
      </div>

      {/* Специализация — необязательное, свободный текст */}
      <div className="pro-field">
        <label htmlFor="pro-specialization">Специализация</label>
        <input
          id="pro-specialization"
          name="specialization"
          type="text"
          placeholder="Например: нутрициолог, тренер, врач"
          defaultValue={state.specialization ?? ""}
        />
      </div>

      {/* Город — необязательное */}
      <div className="pro-field">
        <label htmlFor="pro-city">Город</label>
        <input
          id="pro-city"
          name="city"
          type="text"
          placeholder="Где вы работаете"
          defaultValue={state.city ?? ""}
        />
      </div>

      {/* Сколько клиентов ведёте — выбор из константы, необязательное */}
      <div className="pro-field">
        <label htmlFor="pro-clients-count">Сколько клиентов вы ведёте сейчас</label>
        <select
          id="pro-clients-count"
          name="clientsCount"
          defaultValue={state.clientsCount ?? ""}
        >
          <option value="">Не указано</option>
          {CLIENTS_COUNT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {/* Инструменты — что использует сейчас, необязательное */}
      <div className="pro-field">
        <label htmlFor="pro-current-tools">Чем вы пользуетесь сейчас</label>
        <input
          id="pro-current-tools"
          name="currentTools"
          type="text"
          placeholder="Таблицы, Telegram, другой сервис"
          defaultValue={state.currentTools ?? ""}
        />
      </div>

      {/* Комментарий — текстовое поле, необязательное */}
      <div className="pro-field">
        <label htmlFor="pro-comment">Комментарий</label>
        <textarea
          id="pro-comment"
          name="comment"
          rows={4}
          placeholder="Что-нибудь ещё, что нам стоит знать"
          defaultValue={state.comment ?? ""}
        />
      </div>

      {/* Обязательное согласие на обработку данных со ссылкой */}
      <div className="pro-field pro-consent">
        <label htmlFor="pro-consent">
          <input
            id="pro-consent"
            name="consent"
            type="checkbox"
            defaultChecked={state.consent ?? false}
            required
          />
          <span>
            Даю согласие на <Link href="/legal/consent" target="_blank" rel="noreferrer">обработку моих данных</Link>
          </span>
        </label>
      </div>

      {/* Сообщение об ошибке, если она есть */}
      {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}

      {/* Кнопка отправки */}
      <button type="submit" disabled={pending} className="pro-submit">
        {pending ? "Отправляем…" : "Подать заявку"}
      </button>
    </form>
  );
}
