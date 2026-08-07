"use client";

// Привязка зависшего платежа к человеку.
//
// Отдельным клиентским компонентом ради ответа на месте: строк в таблице
// может быть несколько, и перезагрузка страницы после каждой теряла бы
// прокрутку и место, на котором остановились.
//
// Тариф выбирается руками, даже когда он определился по сумме. Причина в
// том, что сюда попадают ровно те платежи, где автоматика чему-то не
// поверила, и подставлять её же догадку молчаливым умолчанием — способ
// повторить ту же ошибку, только теперь за подписью человека.

import { useState, useTransition } from "react";
import { TARIFFS } from "@/lib/paid";
import { attachPaymentAction } from "../actions";

export function AttachPayment({ paymentId, tariff }: { paymentId: number; tariff: string | null }) {
  const [person, setPerson] = useState("");
  const [chosen, setChosen] = useState(tariff ?? TARIFFS[0].key);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function attach() {
    setNote(null);
    startTransition(async () => {
      const result = await attachPaymentAction(paymentId, person.trim(), chosen);
      setNote(result.ok ? `Готово: доступ открыт до ${result.until}.` : result.message);
    });
  }

  return <div className="adm-attach">
    <input
      value={person}
      onChange={(event) => setPerson(event.target.value)}
      placeholder="почта или номер"
      aria-label="Кому засчитать платёж"
    />
    <select value={chosen} onChange={(event) => setChosen(event.target.value)} aria-label="Тариф">
      {TARIFFS.map((item) => (
        <option key={item.key} value={item.key}>{item.label} · {item.days} дн.</option>
      ))}
    </select>
    <button className="white-button" disabled={busy || person.trim() === ""} onClick={attach}>
      Засчитать
    </button>
    {note && <span className="adm-muted">{note}</span>}
  </div>;
}
