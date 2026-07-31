"use client";

import { useState } from "react";
import { linkAccount, registerByTelegram } from "./api";
import { haptic } from "./telegram";

/**
 * Первый экран для того, у кого ещё нет дневника.
 *
 * Раньше здесь был тупик: единственным путём была привязка кодом, а код
 * выдаётся в веб-профиле. То есть человеку, нашедшему бота в Telegram,
 * предлагалось уйти на сайт, зарегистрироваться, найти в настройках код,
 * вернуться и ввести его — пять шагов и два переключения между приложениями.
 * На каждом переходе часть людей просто не доходила.
 *
 * Теперь начать можно отсюда: подпись initData ставит сам Telegram, и по ней
 * мы знаем, чей это дневник, не хуже, чем знали бы по паролю. Почта и пароль
 * не спрашиваются вовсе — они нужны только тем, кто захочет открыть дневник
 * в браузере, и попросить их можно потом.
 *
 * Привязка кодом никуда не делась: она нужна тем, у кого аккаунт на сайте уже
 * есть, — иначе они завели бы второй и потеряли свои записи.
 */
export function LinkScreen({ onLinked }: { onLinked: () => void }) {
  const [mode, setMode] = useState<"start" | "code">("start");

  return <div className="tg-page tg-link-page">
    <div className="tg-center-block">
      <span className="tg-mark">Ж</span>
      {mode === "start" ? <StartBlock onLinked={onLinked} onHaveAccount={() => setMode("code")} />
        : <CodeBlock onLinked={onLinked} onBack={() => setMode("start")} />}
    </div>
  </div>;
}

function StartBlock({ onLinked, onHaveAccount }: { onLinked: () => void; onHaveAccount: () => void }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await registerByTelegram(true);
      haptic("success");
      onLinked();
    } catch {
      haptic("error");
      setError("Не получилось завести дневник. Попробуйте ещё раз через минуту.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h1>Заведём дневник</h1>
    <p className="tg-hint">
      Ни почты, ни пароля не нужно — Telegram уже подтвердил, кто вы.
      Фотографируйте еду, остальное посчитаем.
    </p>

    {/* Согласие — отдельным действием, а не мелким шрифтом под кнопкой:
        обрабатывать данные без него нельзя, и человек должен это заметить. */}
    <label className="tg-consent">
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      <span>
        Принимаю <a href="/legal/terms" target="_blank" rel="noreferrer">условия</a> и{" "}
        <a href="/legal/privacy" target="_blank" rel="noreferrer">политику конфиденциальности</a>.
        Мне есть 14 лет; если меньше 18 — с согласия родителей.
      </span>
    </label>

    {error && <p className="tg-error">{error}</p>}

    <button className="tg-button tg-button-block" onClick={() => void start()} disabled={busy || !consent}>
      {busy ? "Заводим…" : "Начать"}
    </button>
    <button className="tg-link tg-link-block" onClick={onHaveAccount}>
      У меня уже есть аккаунт на сайте
    </button>
  </>;
}

function CodeBlock({ onLinked, onBack }: { onLinked: () => void; onBack: () => void }) {
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

  return <>
    <h1>Свяжем аккаунты</h1>
    <p className="tg-hint">
      Откройте <b>Настройки → Telegram</b> в веб-версии, получите код и введите его здесь.
      Дальше вход будет автоматическим, а записи с сайта окажутся тут же.
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
    <button className="tg-link tg-link-block" onClick={onBack}>
      Назад
    </button>
  </>;
}
