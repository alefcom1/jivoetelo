"use client";

import { useState } from "react";
import { linkAccount } from "./api";
import { haptic } from "./telegram";

/**
 * Привязка аккаунта одноразовым кодом из веб-профиля. Пароль внутри Telegram
 * не спрашиваем: код живёт 15 минут и гасится после использования.
 */
export function LinkScreen({ onLinked }: { onLinked: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await linkAccount(code);
      haptic("success");
      onLinked();
    } catch {
      haptic("error");
      setError("Код не подошёл. Проверьте его в веб-версии — он действует 15 минут.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="tg-page tg-link-page">
    <div className="tg-center-block">
      <span className="tg-mark">Ж</span>
      <h1>Свяжем аккаунты</h1>
      <p className="tg-hint">
        Откройте <b>Настройки → Telegram</b> в веб-версии, получите код и введите его здесь.
        Дальше вход в Mini App будет автоматическим.
      </p>

      <input
        className="tg-input tg-code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="A1B2C3D4"
        inputMode="text"
        autoCapitalize="characters"
        maxLength={12}
        aria-label="Код привязки"
      />

      {error && <p className="tg-error">{error}</p>}

      <button className="tg-button tg-button-block" onClick={() => void submit()} disabled={busy || code.length < 4}>
        {busy ? "Проверяем…" : "Связать аккаунт"}
      </button>
      <a className="tg-link tg-link-block" href="/app/settings" target="_blank" rel="noreferrer">
        Получить код в веб-версии →
      </a>
    </div>
  </div>;
}
