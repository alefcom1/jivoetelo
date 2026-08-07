"use client";

// Платный доступ в настройках: что открыто сейчас и ввод кода.
//
// Кода и оплаты здесь два разных разговора, но одно поле «до какого числа»:
// откуда пришли дни, человеку неважно, важно, до какого числа они есть.
// Поэтому блок один, а не два (см. lib/paid.ts).

import { useActionState } from "react";
import { redeemVoucherAction, type RedeemState } from "../account-actions";

export type PayLink = { key: string; label: string; priceRub: number; url: string };

export function AccessPanel({
  daysLeft,
  until,
  payLinks,
}: {
  daysLeft: number;
  until: string | null;
  /** null — оплата не настроена или выключена: кнопок тогда просто нет. */
  payLinks: PayLink[] | null;
}) {
  const [state, action, pending] = useActionState(redeemVoucherAction, { status: "idle" } as RedeemState);

  return <div className="access-panel">
    <p>
      {daysLeft > 0 && until
        ? `Платный доступ открыт до ${until} — это ещё ${daysLeft} дн. Выше дневные лимиты распознавания.`
        : "Сейчас бесплатный тариф: дневник, план, вес и обзоры без ограничений, лимиты распознавания обычные."}
    </p>

    {payLinks && payLinks.length > 0 && <div className="pay-links">
      {payLinks.map((link) => (
        // Обычная ссылка, а не кнопка с обработчиком: оплата уходит на
        // сторону Tribute целиком, и промежуточный переход через наш код
        // добавил бы только новое место, где можно потерять человека.
        // rel с noopener обязателен — открываем чужую страницу в новой вкладке.
        <a key={link.key} className="black-button" href={link.url} target="_blank" rel="noopener noreferrer">
          {daysLeft > 0 ? "Продлить" : "Оплатить"} — {link.label.toLowerCase()}, {link.priceRub} ₽
        </a>
      ))}
      <p className="access-note">
        Оплата проходит на стороне Tribute. Доступ откроется автоматически в течение минуты после
        оплаты; если этого не случилось — напишите нам, платёж виден нам в любом случае.
      </p>
    </div>}

    <form action={action} className="voucher-form">
      <label>
        Код доступа
        {/* autoCapitalize и spellCheck выключены: телефон иначе поправит код
            «на человеческий» и подчеркнёт его красным. Регистр и дефисы
            разбираются на сервере (lib/vouchers.ts), поэтому маски здесь нет. */}
        <input
          name="code" type="text" inputMode="text" autoCapitalize="characters"
          autoComplete="off" spellCheck={false} maxLength={20} placeholder="ABCD-2345" required
        />
      </label>
      <button className="black-button" type="submit" disabled={pending}>
        {pending ? "Проверяем…" : "Применить"}
      </button>
    </form>

    {state.status === "ok" && <p className="weight-saved">
      Готово: {state.days} дн. доступа. Действует до {state.until}.
    </p>}
    {state.status === "failed" && <p className="form-error">{state.message}</p>}
  </div>;
}
