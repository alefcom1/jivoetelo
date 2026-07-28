"use client";

import { useState } from "react";
import { generateLinkCode, unlinkTelegram, type LinkCodeState } from "../telegram-actions";

export function TelegramLink({ linked }: { linked: boolean }) {
  const [state, setState] = useState<LinkCodeState | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleGenerate() {
    setBusy(true);
    try {
      setState(await generateLinkCode());
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    if (!window.confirm("Отвязать Telegram? Mini App попросит код заново.")) return;
    setBusy(true);
    try {
      await unlinkTelegram();
      setState(null);
    } finally {
      setBusy(false);
    }
  }

  return <div className="tg-link-settings">
    {linked
      ? <>
          <p>Telegram привязан — Mini App открывается без пароля.</p>
          <button className="link-button" onClick={handleUnlink} disabled={busy}>Отвязать Telegram</button>
        </>
      : <>
          <p>Получите код и введите его в Mini App — после этого вход будет автоматическим.</p>
          {state?.code
            ? <div className="link-code-box">
                <strong>{state.code}</strong>
                <span>Код действует 15 минут. Введите его в Mini App.</span>
              </div>
            : null}
          {state?.error && <p className="form-error">{state.error}</p>}
          <button className="black-button" onClick={handleGenerate} disabled={busy}>
            {busy ? "Создаём…" : state?.code ? "Создать новый код" : "Получить код"}
          </button>
        </>}
  </div>;
}
