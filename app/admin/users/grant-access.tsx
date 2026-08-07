"use client";

// Тариф человека: открыть платный доступ или закрыть его.
//
// Отдельным клиентским компонентом ради одного — показать результат, не
// перезагружая страницу и не теряя открытую карточку. Формой с редиректом
// это стоило бы полного повторного чтения карточки на каждое нажатие.
//
// Кнопки выдачи и кнопка снятия стоят рядом, но выглядят по-разному и
// разделены промежутком: это единственная пара действий в админке, где
// соседний промах отнимает у человека то, за что он мог заплатить.

import { useState, useTransition } from "react";
import { grantAccessAction, revokeAccessAction } from "../actions";

const PRESETS = [
  { days: 30, label: "Месяц" },
  { days: 90, label: "Три месяца" },
  { days: 365, label: "Год" },
];

export function GrantAccess({ personId, hasAccess }: { personId: number; hasAccess: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function grant(days: number) {
    setNote(null);
    startTransition(async () => {
      const result = await grantAccessAction(personId, days);
      setNote(result.ok
        ? `Доступ открыт до ${new Date(result.accessUntil).toLocaleDateString("ru-RU")}.`
        : result.message);
    });
  }

  function revoke() {
    setNote(null);
    startTransition(async () => {
      const result = await revokeAccessAction(personId);
      // Разные тексты на «сняли» и «нечего было снимать»: одинаковый ответ на
      // оба случая заставлял бы каждый раз перепроверять карточку глазами.
      setNote(result.ok
        ? (result.had ? "Оплаченный срок снят." : "Оплаченного срока и не было.")
        : result.message);
    });
  }

  return <div className="adm-grant">
    {PRESETS.map((preset) => (
      <button key={preset.days} className="white-button" disabled={busy} onClick={() => grant(preset.days)}>
        {preset.label}
      </button>
    ))}
    <button
      className="adm-revoke"
      disabled={busy || !hasAccess}
      onClick={revoke}
      title={hasAccess ? undefined : "Оплаченного срока сейчас нет"}
    >
      Снять оплаченный срок
    </button>
    {note && <span className="adm-muted">{note}</span>}
  </div>;
}
