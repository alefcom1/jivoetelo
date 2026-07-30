"use client";

/**
 * Заглушка вкладки «Профиль». Экран (цели, измерения, настройки —
 * docs/miniapp-v2.md) строится отдельно, параллельно с оболочкой; здесь
 * только место в навигации. Управление привязкой Telegram и режимом
 * «скрыть калории» пока остаётся в веб-настройках (`/app/settings`).
 */
export function ProfileTab() {
  return <div className="tg-page">
    <header className="tg-hero">
      <p className="tg-kicker">Профиль</p>
      <h1>Скоро</h1>
    </header>
    <p className="tg-hint">Цели, измерения и настройки появятся здесь.</p>
    <a className="tg-link" href="/app/settings" target="_blank" rel="noreferrer">Пока — веб-настройки →</a>
  </div>;
}
