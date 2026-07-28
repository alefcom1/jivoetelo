"use client";

import { useActionState } from "react";
import { subscribeToBreakdown, type SubscribeState } from "../subscribe-action";
import type { Targets } from "@/lib/targets";

const initialState: SubscribeState = { status: "idle" };

/**
 * Предложение получить разбор расчёта письмом. Появляется только после того,
 * как человек увидел числа: до этого предлагать нечего, и форма выглядела бы
 * платой за вход, а не продолжением.
 *
 * Числа уходят скрытыми полями — те же самые, что показаны выше. Так письмо
 * повторяет ровно то, что человек видел, и серверу не нужны ни рост, ни
 * возраст, ни вес.
 */
export default function EmailCapture({ targets }: { targets: Targets }) {
  const [state, formAction, pending] = useActionState(subscribeToBreakdown, initialState);

  if (state.status === "success") {
    return <div className="raschet-capture raschet-capture-done">
      <p><strong>Письмо в пути.</strong> Если его не видно через несколько минут, загляните в «Промоакции» или в спам — так почта иногда поступает с первым письмом от нового отправителя.</p>
      <p className="field-note">Всего писем будет три. Отписаться можно из любого — ссылка внизу письма.</p>
    </div>;
  }

  return <form className="raschet-capture" action={formAction}>
    <h3>Прислать разбор на почту</h3>
    <p>
      Три письма о том, что эта формула измеряет, чего она не знает и как уточнить план по своим данным.
      Без рассылки о скидках.
    </p>

    <input type="hidden" name="kcalTarget" value={targets.kcalTarget} />
    <input type="hidden" name="kcalMin" value={targets.kcalMin} />
    <input type="hidden" name="kcalMax" value={targets.kcalMax} />
    <input type="hidden" name="proteinTarget" value={targets.proteinTarget} />

    <div className="raschet-capture-row">
      <input
        name="email"
        type="email"
        placeholder="Ваш e-mail"
        defaultValue={state.email ?? ""}
        required
        autoComplete="email"
      />
      <button className="black-button" type="submit" disabled={pending}>
        {pending ? "Отправляем…" : "Получить разбор"}
      </button>
    </div>

    <label className="consent">
      <input name="consent" type="checkbox" defaultChecked={state.consent ?? false} required />
      <span>
        Согласен на обработку адреса для этой серии писем — <a href="/legal/consent" target="_blank">согласие</a> и{" "}
        <a href="/legal/privacy" target="_blank">политика</a>.
      </span>
    </label>

    {state.status === "invalid" && <small className="form-error">Похоже, в адресе опечатка — проверьте и попробуйте ещё раз.</small>}
    {state.status === "no_consent" && <small className="form-error">Без согласия мы не сохраняем адрес — отметьте галочку.</small>}
    {state.status === "bad_context" && <small className="form-error">Расчёт не сходится — измените значение в форме выше и попробуйте снова.</small>}
    {state.status === "error" && <small className="form-error">Не получилось сохранить. Попробуйте ещё раз через минуту.</small>}
  </form>;
}
