"use client";

// Платный доступ в настройках: что открыто сейчас и ввод кода.
//
// Кода и оплаты здесь два разных разговора, но одно поле «до какого числа»:
// откуда пришли дни, человеку неважно, важно, до какого числа они есть.
// Поэтому блок один, а не два (см. lib/paid.ts).

import { useActionState } from "react";
import { redeemVoucherAction, type RedeemState } from "../account-actions";

export function AccessPanel({ daysLeft, until }: { daysLeft: number; until: string | null }) {
  const [state, action, pending] = useActionState(redeemVoucherAction, { status: "idle" } as RedeemState);

  return <div className="access-panel">
    <p>
      {daysLeft > 0 && until
        ? `Платный доступ открыт до ${until} — это ещё ${daysLeft} дн. Выше дневные лимиты распознавания.`
        : "Сейчас бесплатный тариф: доступны все возможности сервиса, лимиты распознавания обычные."}
    </p>

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
