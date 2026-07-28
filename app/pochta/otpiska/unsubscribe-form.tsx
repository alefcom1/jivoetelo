"use client";

import { useActionState } from "react";
import { unsubscribe, type UnsubscribeState } from "../unsubscribe-action";

const initialState: UnsubscribeState = { status: "idle" };

export default function UnsubscribeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(unsubscribe, initialState);

  // Неизвестная метка выглядит так же, как успешная отписка. Показать
  // «такого адреса у нас нет» значит подтвердить обратное для тех адресов,
  // где страница ответила иначе.
  if (state.status === "done" || state.status === "unknown") {
    return <>
      <p><strong>Готово. Больше писем этой серии не будет.</strong></p>
      <p>
        Это не влияет на письма о самом сервисе, если у вас есть аккаунт: уведомления о нём настраиваются
        отдельно, в настройках.
      </p>
    </>;
  }

  return <form action={formAction}>
    <p>Нажмите кнопку — и серия писем с разбором расчёта прекратится.</p>
    <input type="hidden" name="token" value={token} />
    <p>
      <button className="black-button" type="submit" disabled={pending}>
        {pending ? "Отписываем…" : "Отписаться"}
      </button>
    </p>
    {state.status === "error" && <p className="form-error">Не получилось. Попробуйте ещё раз через минуту.</p>}
  </form>;
}
