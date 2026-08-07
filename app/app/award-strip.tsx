"use client";

// Взятая награда в веб-кабинете.
//
// Полосой на месте .streak-strip: это тот же персонаж и то же место, только
// повод другой. Показывается в день взятия; список всего взятого — в «Обзоре».
//
// Клиентский из-за одного: кнопка «поделиться». В вебе нет Telegram, который
// открыл бы выбор чата, поэтому здесь копирование в буфер или системный лист
// выбора — то же, что в Mini App делает `copyOrShare`.

import { useState } from "react";
import { mascotImage } from "@/lib/mascot";
import { shareAward } from "./share-actions";

type Award = { key: string; title: string; note: string };

export function AwardStrip({ award }: { award: Award }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    setBusy(true);
    try {
      // Текст собирает сервер: он же собирается для Mini App, и две редакции
      // одного сообщения разошлись бы. Правило «наружу ни слова про вес»
      // должно жить в одном месте (lib/share-text.ts).
      const text = await shareAward(award.key);
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ text });
          return;
        } catch {
          // Отмена выбора — не ошибка: человек передумал. Копируем.
        }
      }
      await navigator.clipboard.writeText(text);
      setNote("Скопировано — можно отправить кому угодно.");
    } catch {
      setNote("Не получилось подготовить ссылку. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="award-strip" role="status">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={mascotImage("cheer")} alt="" aria-hidden width={288} height={288} />
    <div>
      <b>{award.title}</b>
      <p>{award.note}</p>
      <button className="link-button" onClick={() => void handleShare()} disabled={busy}>
        {busy ? "Готовим…" : "Отправить другу"}
      </button>
      {note && <span className="award-note">{note}</span>}
    </div>
  </section>;
}
