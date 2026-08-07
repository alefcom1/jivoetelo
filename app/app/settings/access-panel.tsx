"use client";

// Доступ в настройках: что открыто сейчас, до какого числа и как продлить.
//
// Оплата, код и приглашение — три разных разговора, но одно поле «до какого
// числа»: откуда пришли дни, человеку неважно, важно, до какого числа они
// есть. Поэтому блок один, а не три (см. lib/paid.ts).
//
// Три состояния, и путать их нельзя. Сказать «у вас платный доступ» тому, кто
// идёт по пробному месяцу, — значит пообещать списание, которого не было, и
// через месяц «доступ закончился» прочитается как обман.

import { useActionState } from "react";
import { redeemVoucherAction, type RedeemState } from "../account-actions";

export type PayLink = { key: string; label: string; priceRub: number; url: string };

export function AccessPanel({
  daysLeft,
  until,
  trial,
  payLinks,
}: {
  daysLeft: number;
  until: string | null;
  /** Доступ открыт пробным месяцем, а не оплатой. */
  trial: boolean;
  /** null — оплата не настроена или выключена: кнопок тогда просто нет. */
  payLinks: PayLink[] | null;
}) {
  const [state, action, pending] = useActionState(redeemVoucherAction, { status: "idle" } as RedeemState);
  const open = daysLeft > 0 && until;

  return <div className="access-panel">
    {open && trial && <p>
      Идёт пробный месяц: разбор по фото, по описанию и голосом открыт до {until} — это ещё {daysLeft} дн.
      Дальше дневник, план, вес, обзоры и каталог останутся как есть, а разбор нужно будет открыть.
    </p>}
    {open && !trial && <p>
      Доступ открыт до {until} — это ещё {daysLeft} дн. Разбор по фото, по описанию и голосом работает
      без пересчёта дней при продлении: остаток не сгорает.
    </p>}
    {/* Отказ не должен быть тупиком: сразу оба выхода и прямо сказано, что
        именно осталось. Человек, у которого месяцы записей, в первую очередь
        боится потерять их, а не лимит. */}
    {!open && <p>
      Пробный месяц закончился. Дневник, план, вес, обзоры, каталог и выгрузка данных остались на
      месте — записывать еду можно руками как раньше. Разбор по фото, по описанию и голосом
      открывается оплатой или приглашением: за каждого пришедшего друга месяц получаете и вы, и он.
    </p>}

    {payLinks && payLinks.length > 0 && <div className="pay-links">
      {payLinks.map((link) => (
        // Обычная ссылка, а не кнопка с обработчиком: оплата уходит на
        // сторону Tribute целиком, и промежуточный переход через наш код
        // добавил бы только новое место, где можно потерять человека.
        // rel с noopener обязателен — открываем чужую страницу в новой вкладке.
        <a key={link.key} className="black-button" href={link.url} target="_blank" rel="noopener noreferrer">
          {open ? "Продлить" : "Оплатить"} — {link.label.toLowerCase()}, {link.priceRub} ₽
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
