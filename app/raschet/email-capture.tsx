"use client";

import { useActionState } from "react";
import { subscribeToBreakdown, type SubscribeState } from "./subscribe-action";
import type { SubscribeSource } from "@/lib/subscribe-source";

const initialState: SubscribeState = { status: "idle" };

/**
 * Числа расчёта, которые умеют показывать письма серии, — см.
 * SERIES_CONTEXT_FIELDS в lib/email-series.ts. Список продублирован здесь
 * буквально, а не импортирован: тот модуль тянет за собой lib/dates.ts ради
 * scheduleLetterAt, а клиентскому компоненту из всего этого нужны только
 * четыре имени полей для скрытых input.
 */
const CONTEXT_FIELDS = ["kcalTarget", "kcalMin", "kcalMax", "proteinTarget"] as const;

export type EmailCaptureContext = Partial<Record<(typeof CONTEXT_FIELDS)[number], number>>;

/**
 * Предложение получить разбор расчёта письмом. Появляется только после того,
 * как человек увидел числа: до этого предлагать нечего, и форма выглядела бы
 * платой за вход, а не продолжением.
 *
 * Раньше форма принимала целиком `Targets` энергии — единственного
 * калькулятора, где стояла. Теперь источников несколько, и у каждого свой
 * набор чисел (у белка — только грамм в день, у страницы блюда — вообще
 * никаких), поэтому компонент берёт источник и произвольное подмножество
 * чисел, а не завязан на форму одного конкретного расчёта.
 *
 * Числа уходят скрытыми полями — те же самые, что показаны на странице. Так
 * письмо повторяет ровно то, что человек видел, и серверу не нужны ни рост,
 * ни возраст, ни вес.
 */
export default function EmailCapture({
  source,
  context = {},
}: {
  /** Какой калькулятор или какая страница блюда показывает форму — см. lib/subscribe-source.ts. */
  source: SubscribeSource;
  context?: EmailCaptureContext;
}) {
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

    <input type="hidden" name="source" value={source} />
    {CONTEXT_FIELDS.map((field) =>
      context[field] !== undefined &&
      <input key={field} type="hidden" name={field} value={context[field]} />)}

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
