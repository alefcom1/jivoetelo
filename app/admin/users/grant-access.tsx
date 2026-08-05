"use client";

// Выдача доступа руками: компенсация за сбой, доступ для своих, тестирование.
//
// Отдельным клиентским компонентом ради одного — показать результат, не
// перезагружая страницу и не теряя открытую карточку. Формой с редиректом
// это стоило бы полного повторного чтения карточки на каждое нажатие.

import { useState, useTransition } from "react";
import { grantAccessAction } from "../actions";

const PRESETS = [
  { days: 30, label: "Месяц" },
  { days: 90, label: "Три месяца" },
  { days: 365, label: "Год" },
];

export function GrantAccess({ personId }: { personId: number }) {
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

  return <div className="adm-grant">
    {PRESETS.map((preset) => (
      <button key={preset.days} className="white-button" disabled={busy} onClick={() => grant(preset.days)}>
        {preset.label}
      </button>
    ))}
    {note && <span className="adm-muted">{note}</span>}
  </div>;
}
