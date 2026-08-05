"use client";

// Лист «поделиться»: показывает готовый текст и два способа его отправить.
//
// Почему текст видно до отправки. Человек отправляет это друзьям от своего
// имени — он вправе прочитать, что именно уйдёт, до того как оно уйдёт.
// Кнопка, отправляющая неизвестно что, нажимается один раз и больше никогда.
//
// Текст приходит с сервера (app/api/tg/share), а не собирается здесь: он же
// собирается для веба, и две редакции одного сообщения разошлись бы. Правило
// «наружу не уходит ни слова про вес» должно жить в одном месте.

import { useEffect, useState } from "react";
import { fetchShareText } from "./plan-profile-api";
import { copyOrShare, shareToTelegram } from "./share";
import { haptic } from "./telegram";

export function ShareSheet({ awardKey, onClose }: { awardKey?: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchShareText(awardKey)
      .then((result) => { if (alive) setText(result.text); })
      .catch(() => { if (alive) setError("Не получилось подготовить ссылку. Попробуйте ещё раз."); });
    return () => { alive = false; };
  }, [awardKey]);

  async function handleCopy() {
    if (!text) return;
    const result = await copyOrShare(text);
    haptic(result === "failed" ? "error" : "success");
    setNote(result === "copied" ? "Скопировано — можно вставить куда угодно." : result === "failed" ? "Скопировать не вышло. Выделите текст вручную." : null);
  }

  return <div className="tg-share-backdrop" role="dialog" aria-label="Поделиться" onClick={onClose}>
    {/* Останавливаем всплытие: нажатие по самому листу не должно его закрывать. */}
    <section className="tg-share" onClick={(e) => e.stopPropagation()}>
      <h2>Отправить другу</h2>
      {error && <p className="tg-error">{error}</p>}
      {!text && !error && <div className="tg-spinner" aria-label="Готовим ссылку" />}
      {text && <>
        <p className="tg-share-preview">{text}</p>
        <button className="tg-button tg-button-block" onClick={() => { haptic("tap"); shareToTelegram(text); }}>
          Выбрать чат в Telegram
        </button>
        <button className="tg-link-button" onClick={() => void handleCopy()}>
          Скопировать или отправить иначе
        </button>
        {note && <p className="tg-hint">{note}</p>}
      </>}
      <button className="tg-link-button" onClick={onClose}>Закрыть</button>
    </section>
  </div>;
}
