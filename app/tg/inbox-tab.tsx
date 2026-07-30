"use client";

import { useEffect, useState } from "react";
import { dismissInboxItem, fetchInbox, type InboxItemDto } from "./api";
import { haptic } from "./telegram";
import { TgPhoto } from "./photo";

/**
 * Снимки, присланные боту и ещё не разобранные. Экран нужен именно здесь, а
 * не только в вебе: человек фотографирует еду в Telegram и разбирать её
 * логично там же, не выходя в браузер, где сессии может и не быть.
 *
 * В Mini App v2 это не отдельная вкладка (раздел «Три отличия от макета»
 * спецификации): экран открывается строкой-ссылкой с «Сегодня», поэтому
 * ему нужен путь назад — `onBack`.
 */
export function InboxTab({ onPick, onBack }: { onPick: (item: InboxItemDto) => void; onBack?: () => void }) {
  const [items, setItems] = useState<InboxItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    // Флаг отмены: вкладку легко закрыть быстрее, чем ответит сеть, и тогда
    // обновлять состояние уже некуда.
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchInbox();
        if (cancelled) return;
        setItems(data.items);
        setError(null);
      } catch {
        if (!cancelled) setError("Не получилось загрузить инбокс.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDismiss(id: number) {
    setBusyId(id);
    haptic("tap");
    try {
      await dismissInboxItem(id);
      setItems((current) => current && current.filter((item) => item.id !== id));
    } catch {
      setError("Не получилось отклонить снимок.");
    } finally {
      setBusyId(null);
    }
  }

  const backLink = onBack &&
    <button className="tg-link-button" onClick={() => { haptic("tap"); onBack(); }}>← На «Сегодня»</button>;

  if (!items) {
    return <div className="tg-page">
      {backLink}
      <header className="tg-hero"><h1>Инбокс</h1></header>
      {error ? <p className="tg-error">{error}</p> : <div className="tg-spinner" aria-label="Загрузка" />}
    </div>;
  }

  if (items.length === 0) {
    return <div className="tg-page">
      {backLink}
      <header className="tg-hero"><h1>Инбокс пуст</h1></header>
      <section className="tg-card tg-hint-card">
        <p>
          Пришлите боту фото еды — хоть в кафе, хоть на бегу. Снимки подождут здесь, а разобрать их можно
          вечером, за пару минут.
        </p>
      </section>
    </div>;
  }

  return <div className="tg-page">
    {backLink}
    <header className="tg-hero">
      <p className="tg-kicker">Ждут разбора</p>
      <h1>Инбокс</h1>
    </header>

    {error && <p className="tg-error">{error}</p>}

    <ul className="tg-inbox">
      {items.map((item) =>
        <li key={item.id} className="tg-inbox-item">
          <button className="tg-inbox-photo" onClick={() => { haptic("tap"); onPick(item); }}>
            <TgPhoto photoKey={item.photoKey} alt="Снимок еды" />
          </button>
          <div className="tg-inbox-body">
            <p className="tg-inbox-when">{formatTakenAt(item)}</p>
            {item.note && <p className="tg-inbox-note">«{item.note}»</p>}
            <div className="tg-inbox-actions">
              <button className="tg-button" onClick={() => { haptic("tap"); onPick(item); }}>Разобрать</button>
              <button
                className="tg-link-button"
                onClick={() => void handleDismiss(item.id)}
                disabled={busyId === item.id}
              >
                Отклонить
              </button>
            </div>
          </div>
        </li>)}
    </ul>
  </div>;
}

function formatTakenAt(item: InboxItemDto): string {
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(`${item.takenOn}T12:00:00Z`),
  );
  return `${day}, ${item.takenTime}`;
}
